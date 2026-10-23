import { query } from '../../config/db.js';
import { aiStatus } from '../ai/index.js';
import { buildRecordItems, type RecordItem } from './context.js';
import type { Lang } from './safety.js';

/**
 * The patient's timeline: one read-only list of events, newest first. Nothing here is written by the patient and nothing
 * is written back; an event is derived from a row that already exists (a clinician's released record, a document
 * reading, what the patient reported). Each event says where it came from and how sure that source is, and an item the
 * reader could not place with confidence is marked rather than smoothed over.
 *
 * `ref` is the same reference the visit summary uses ("fact:<uuid>", "entry:<uuid>", ...), so choosing events for a
 * summary never copies or changes the event itself.
 */
export type EventCategory = 'condition' | 'medication' | 'allergy' | 'procedure' | 'test' | 'symptom' | 'visit' | 'document' | 'other';
/** record_ai: read from a document by software. patient: reported by the patient. clinician: released by a clinician. upload: the file itself. */
export type EventOrigin = 'record_ai' | 'patient' | 'clinician' | 'upload';
/** clear: no reason to doubt it. check: low or missing confidence. conflict: another event says something different. undated: no date could be read. */
export type Certainty = 'clear' | 'check' | 'conflict' | 'undated';

export interface TimelineEvent {
  ref: string;
  category: EventCategory;
  title: string;
  detail: string;
  date: string | null;
  origin: EventOrigin;
  /** True when the patient later confirmed a document reading; it is still not a clinician's verification. */
  confirmedByPatient: boolean;
  certainty: Certainty;
  confidence: number | null;
  source: { documentId: string; title: string | null; page: number | null; passage: string | null } | null;
  /** Why the reader surfaced it, as the reader stated it. */
  rationale: string | null;
  conflictsWith: string[];
}

export interface TimelineStatus {
  aiConfigured: boolean;
  documents: { total: number; readable: number; waiting: number; failed: number; notAllowed: number };
}

/** Below this the reading is marked "check". The provider's own number, never adjusted. */
export const LOW_CONFIDENCE = 0.6;

const CATEGORY: Record<RecordItem['type'], EventCategory> = {
  condition: 'condition',
  medication: 'medication',
  allergy: 'allergy',
  procedure: 'procedure',
  measurement: 'test',
  visit: 'visit',
  symptom: 'symptom',
  document: 'document',
  doc_fact: 'other',
  clinician_visit: 'visit',
  clinician_prescription: 'medication',
  clinician_lab: 'test',
  clinician_allergy: 'allergy',
  appointment: 'visit',
};

const FACT_CATEGORY: Record<string, EventCategory> = {
  condition: 'condition',
  medication: 'medication',
  allergy: 'allergy',
  lab_value: 'test',
  procedure: 'procedure',
  followup: 'visit',
  other: 'other',
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const day = (v: unknown): string | null => (typeof v === 'string' ? v.slice(0, 10) : v instanceof Date ? v.toISOString().slice(0, 10) : null);
const cut = (s: string | null | undefined, n: number) => (s ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : null);

/**
 * Marks events that disagree: the same category and the same name, read with a different value. Two readings of the same
 * value are not a conflict. Both sides are marked and each lists the other, so neither is silently preferred.
 */
export function markConflicts(events: TimelineEvent[], values: Map<string, string>): void {
  const groups = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    if (e.category === 'document' || e.category === 'visit' || e.category === 'symptom') continue;
    const key = `${e.category}|${norm(e.title)}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const e of group) {
      const mine = values.get(e.ref) ?? '';
      const others = group.filter((o) => o !== e && (values.get(o.ref) ?? '') !== mine && (e.date === o.date || !e.date || !o.date));
      if (others.length === 0) continue;
      e.conflictsWith = others.map((o) => o.ref);
      e.certainty = 'conflict';
    }
  }
}

export async function buildEvents(patientId: string, lang: Lang): Promise<{ events: TimelineEvent[]; status: TimelineStatus }> {
  const events: TimelineEvent[] = [];
  const values = new Map<string, string>();

  // Everything the record already holds except unconfirmed document readings, which carry more detail below.
  const items = (await buildRecordItems(patientId, lang)).filter((i) => i.type !== 'doc_fact');
  const docTitles = new Map<string, string>();
  for (const i of items) {
    if (i.type === 'document' && i.documentId) docTitles.set(i.documentId, i.title);
    const origin: EventOrigin = i.origin === 'clinician' ? 'clinician' : i.origin === 'upload' ? 'upload' : i.origin === 'document' ? 'record_ai' : 'patient';
    const e: TimelineEvent = {
      ref: i.ref,
      category: CATEGORY[i.type],
      title: i.title,
      detail: i.summary,
      date: i.date,
      origin,
      confirmedByPatient: i.origin === 'document',
      certainty: i.date ? 'clear' : 'undated',
      confidence: null,
      source: i.documentId ? { documentId: i.documentId, title: i.title, page: null, passage: null } : null,
      rationale: null,
      conflictsWith: [],
    };
    events.push(e);
    values.set(e.ref, norm(i.summary));
  }

  // Readings the software took from the patient's documents. Rejected ones are gone; decided ones are already entries above.
  const facts = await query(
    `SELECT f.id, f.document_id, f.kind, f.label, f.value, f.unit, to_char(f.fact_date,'YYYY-MM-DD') AS fact_date, f.source_page,
            f.source_passage, f.confidence, f.rationale, COALESCE(d.title, d.file_name) AS document_title
     FROM document_facts f JOIN documents d ON d.id = f.document_id
     WHERE f.patient_id = $1 AND d.deleted_at IS NULL AND f.patient_decision IS NULL AND f.review_status <> 'rejected'
     ORDER BY f.created_at DESC LIMIT 300`,
    [patientId]
  );
  for (const f of facts.rows) {
    const confidence = f.confidence === null || f.confidence === undefined ? null : Number(f.confidence);
    const value = f.value ? `${f.value}${f.unit ? ` ${f.unit}` : ''}` : '';
    const e: TimelineEvent = {
      ref: `fact:${f.id}`,
      category: FACT_CATEGORY[f.kind] ?? 'other',
      title: f.label,
      detail: value,
      date: f.fact_date,
      origin: 'record_ai',
      confirmedByPatient: false,
      certainty: confidence === null || confidence < LOW_CONFIDENCE ? 'check' : f.fact_date ? 'clear' : 'undated',
      confidence,
      source: { documentId: f.document_id, title: f.document_title, page: f.source_page ?? null, passage: cut(f.source_passage, 400) },
      rationale: cut(f.rationale, 300),
      conflictsWith: [],
    };
    // A reading that is both low-confidence and undated stays "check": the weaker statement is the one to show.
    events.push(e);
    values.set(e.ref, norm(value));
  }

  markConflicts(events, values);
  events.sort((a, b) => (a.date === b.date ? 0 : a.date === null ? 1 : b.date === null ? -1 : a.date < b.date ? 1 : -1));

  const docs = await query(
    `SELECT d.ai_processing_allowed AS allowed, dp.status
     FROM documents d LEFT JOIN document_processing dp ON dp.document_id = d.id
     WHERE d.patient_id = $1 AND d.deleted_at IS NULL AND d.visible_to_patient = TRUE`,
    [patientId]
  );
  const status: TimelineStatus = {
    aiConfigured: aiStatus().configured,
    documents: { total: docs.rowCount ?? 0, readable: 0, waiting: 0, failed: 0, notAllowed: 0 },
  };
  for (const r of docs.rows) {
    if (r.status === 'completed') status.documents.readable += 1;
    else if (r.status === 'failed') status.documents.failed += 1;
    else if (r.status === 'queued' || r.status === 'processing') status.documents.waiting += 1;
    else if (!r.allowed) status.documents.notAllowed += 1;
  }
  return { events: events.slice(0, 400), status };
}
