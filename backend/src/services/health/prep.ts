import { query } from '../../config/db.js';
import { buildRecordItems, type RecordItem } from './context.js';
import type { Lang } from './safety.js';

/**
 * Visit preparation: a draft the patient edits and approves before anything can be shared.
 *
 * The draft is assembled by plain code from the patient's own record. No model writes any fact into it, so every item is
 * grounded by construction and carries a `source` that points at the record row it came from. A model may only offer an
 * optional plain-language overview (see assistantService), which the patient reads and accepts or discards.
 */
export const SECTION_KEYS = ['symptoms', 'conditions', 'medications', 'allergies', 'procedures', 'measurements', 'documents', 'questions', 'notes'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SOURCE_KINDS = ['symptom', 'entry', 'document', 'visit', 'prescription', 'lab', 'allergy', 'fact', 'patient'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface PrepItem {
  id: string;
  text: string;
  date: string | null;
  source: { kind: SourceKind; ref: string | null; label: string };
  edited?: boolean;
}
export interface PrepSection {
  key: SectionKey;
  included: boolean;
  items: PrepItem[];
}
export interface PrepContent {
  lang: Lang;
  reason: string;
  overview: string;
  sections: PrepSection[];
}

const L = {
  ar: {
    origin: { patient: 'أدخلتُه بنفسي', assistant: 'من محادثة المساعد وأكدتُه', document: 'من مستند وأكدتُه', clinician: 'سجّله طبيب', upload: 'رفعتُه بنفسي', ai_suggestion: 'قراءة آلية من مستند، لم يراجعها طبيب' },
    sev: 'الشدة',
    from: 'منذ',
  },
  en: {
    origin: { patient: 'Entered by me', assistant: 'From assistant chat, confirmed by me', document: 'From a document, confirmed by me', clinician: 'Recorded by a clinician', upload: 'Uploaded by me', ai_suggestion: 'Read from a document by software, not checked by a clinician' },
    sev: 'Severity',
    from: 'since',
  },
};

const newId = () => globalThis.crypto.randomUUID();

const KIND_BY_PREFIX: Record<string, SourceKind> = { fact: 'fact', symptom: 'symptom', entry: 'entry', document: 'document', visit: 'visit', rx: 'prescription', lab: 'lab', allergy: 'allergy' };

function toItem(i: RecordItem, lang: Lang, text?: string): PrepItem {
  const [prefix, id] = i.ref.split(':');
  return {
    id: newId(),
    text: text ?? [i.title, i.summary].filter(Boolean).join(' — '),
    date: i.date,
    source: { kind: KIND_BY_PREFIX[prefix] ?? 'patient', ref: id ?? null, label: L[lang].origin[i.origin] },
  };
}

export async function buildDraft(patientId: string, lang: Lang, reason: string): Promise<PrepContent> {
  const all = await buildRecordItems(patientId, lang);
  const byType = (...t: RecordItem['type'][]) => all.filter((i) => t.includes(i.type));
  const sinceYear = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);

  const symptoms = byType('symptom')
    .filter((i) => !i.date || i.date >= new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10))
    .sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? -1 : 1))
    .slice(-12);
  const measurements = byType('measurement').slice(0, 8);
  const documents = byType('document').filter((i) => (i.date ?? '') >= sinceYear).slice(0, 6);
  const meds = [...byType('medication'), ...byType('clinician_prescription').slice(0, 5)];
  const allergies = [...byType('allergy'), ...byType('clinician_allergy')];

  // Only conditions and medications the patient marked as current go into the default draft; they can add others.
  const active = new Set(
    (await query(`SELECT id FROM health_entries WHERE patient_id = $1 AND deleted_at IS NULL AND kind IN ('condition','medication') AND status = 'active'`, [patientId])).rows.map((r) => r.id as string)
  );
  const isActive = (i: RecordItem) => !i.ref.startsWith('entry:') || active.has(i.ref.slice(6));

  const section = (key: SectionKey, items: PrepItem[], included = true): PrepSection => ({ key, included: included && items.length > 0, items });
  return {
    lang,
    reason,
    overview: '',
    sections: [
      section('symptoms', symptoms.map((i) => toItem(i, lang, `${[i.date, i.title].filter(Boolean).join(' — ')}${i.summary ? ` (${i.summary})` : ''}`))),
      section('conditions', byType('condition').filter(isActive).map((i) => toItem(i, lang))),
      section('medications', meds.filter(isActive).map((i) => toItem(i, lang))),
      section('allergies', allergies.map((i) => toItem(i, lang))),
      section('procedures', byType('procedure').slice(0, 8).map((i) => toItem(i, lang))),
      section('measurements', measurements.map((i) => toItem(i, lang))),
      section('documents', documents.map((i) => toItem(i, lang))),
      { key: 'questions', included: false, items: [] },
      { key: 'notes', included: false, items: [] },
    ],
  };
}

/**
 * A draft made of exactly the timeline events the patient chose, in date order. The events are copied by reference: the
 * text comes from the record by code, and the choice changes only this draft, never the timeline. A reading that software
 * took from a document keeps its "not checked by a clinician" label all the way to the clinician's page.
 */
export async function buildDraftFromRefs(patientId: string, lang: Lang, reason: string, refs: string[]): Promise<PrepContent> {
  const wanted = new Set(refs);
  const chosen = (await buildRecordItems(patientId, lang)).filter((i) => wanted.has(i.ref));
  const factIds = chosen.filter((i) => i.ref.startsWith('fact:')).map((i) => i.ref.slice(5));
  const factKinds = new Map<string, string>(
    (await query(`SELECT id, kind FROM document_facts WHERE patient_id = $1 AND id = ANY($2::uuid[])`, [patientId, factIds])).rows.map((r) => [r.id as string, r.kind as string])
  );
  const sectionOf = (i: RecordItem): SectionKey => {
    switch (i.type) {
      case 'symptom': return 'symptoms';
      case 'condition': return 'conditions';
      case 'medication': case 'clinician_prescription': return 'medications';
      case 'allergy': case 'clinician_allergy': return 'allergies';
      case 'procedure': return 'procedures';
      case 'measurement': case 'clinician_lab': return 'measurements';
      case 'document': return 'documents';
      case 'doc_fact': {
        const k = factKinds.get(i.ref.slice(5));
        return k === 'condition' ? 'conditions' : k === 'medication' ? 'medications' : k === 'allergy' ? 'allergies' : k === 'procedure' ? 'procedures' : k === 'lab_value' ? 'measurements' : 'notes';
      }
      default: return 'notes';
    }
  };
  const bySection = new Map<SectionKey, PrepItem[]>();
  for (const i of [...chosen].sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? -1 : 1))) {
    const key = sectionOf(i);
    const text = `${[i.date, i.title].filter(Boolean).join(' — ')}${i.summary ? ` (${i.summary})` : ''}`;
    bySection.set(key, [...(bySection.get(key) ?? []), toItem(i, lang, text)]);
  }
  return {
    lang,
    reason,
    overview: '',
    sections: SECTION_KEYS.map((key) => {
      const items = bySection.get(key) ?? [];
      return { key, included: items.length > 0, items };
    }),
  };
}

// ---------------------------------------------------------------- validation of an edited draft

export type PrepParse = { ok: true; value: PrepContent } | { ok: false; message: string };

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shape-checks a draft sent by the client. Ownership of every source ref is checked separately (verifyRefs). */
export function parsePrepContent(raw: any): PrepParse {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'content is required.' };
  const lang: Lang = raw.lang === 'en' ? 'en' : 'ar';
  const reason = typeof raw.reason === 'string' ? clean(raw.reason) : '';
  const overview = typeof raw.overview === 'string' ? clean(raw.overview) : '';
  if (reason.length > 500) return { ok: false, message: 'The reason for the visit is limited to 500 characters.' };
  if (overview.length > 1500) return { ok: false, message: 'The overview is limited to 1500 characters.' };
  if (!Array.isArray(raw.sections) || raw.sections.length > SECTION_KEYS.length) return { ok: false, message: 'sections are invalid.' };
  const seen = new Set<string>();
  const sections: PrepSection[] = [];
  for (const s of raw.sections) {
    if (!s || !(SECTION_KEYS as readonly string[]).includes(s.key) || seen.has(s.key)) return { ok: false, message: 'A section is invalid or repeated.' };
    seen.add(s.key);
    if (!Array.isArray(s.items) || s.items.length > 40) return { ok: false, message: 'A section has too many items.' };
    const items: PrepItem[] = [];
    for (const it of s.items) {
      const text = typeof it?.text === 'string' ? clean(it.text) : '';
      if (!text || text.length > 600) return { ok: false, message: 'Each item needs text of up to 600 characters.' };
      const kind = it?.source?.kind;
      if (!(SOURCE_KINDS as readonly string[]).includes(kind)) return { ok: false, message: 'An item has an unknown source.' };
      const ref = it.source.ref ?? null;
      if (kind === 'patient' ? ref !== null : typeof ref !== 'string' || !UUID.test(ref)) return { ok: false, message: 'An item has an invalid source reference.' };
      const label = typeof it.source.label === 'string' ? clean(it.source.label).slice(0, 80) : '';
      const date = typeof it.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : null;
      items.push({ id: typeof it.id === 'string' && UUID.test(it.id) ? it.id : newId(), text, date, source: { kind, ref, label }, ...(it.edited === true ? { edited: true } : {}) });
    }
    sections.push({ key: s.key, included: s.included === true, items });
  }
  return { ok: true, value: { lang, reason, overview, sections } };
}

const TABLE_FOR_KIND: Record<Exclude<SourceKind, 'patient'>, string> = {
  symptom: `SELECT id FROM symptom_reports WHERE patient_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])`,
  entry: `SELECT id FROM health_entries WHERE patient_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])`,
  document: `SELECT id FROM documents WHERE patient_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])`,
  visit: `SELECT id FROM visits WHERE patient_id = $1 AND status = 'approved' AND id = ANY($2::uuid[])`,
  prescription: `SELECT id FROM prescriptions WHERE patient_id = $1 AND status = 'approved' AND id = ANY($2::uuid[])`,
  lab: `SELECT lr.id FROM lab_results lr JOIN lab_orders lo ON lo.id = lr.lab_order_id WHERE lo.patient_id = $1 AND lr.status = 'approved' AND lr.id = ANY($2::uuid[])`,
  allergy: `SELECT id FROM patient_allergies WHERE patient_id = $1 AND id = ANY($2::uuid[])`,
  fact: `SELECT f.id FROM document_facts f JOIN documents d ON d.id = f.document_id WHERE f.patient_id = $1 AND d.deleted_at IS NULL AND f.id = ANY($2::uuid[])`,
};

/** True only when every referenced source row belongs to this patient (and is released, for clinician records). */
export async function verifyRefs(patientId: string, content: PrepContent): Promise<boolean> {
  const byKind = new Map<string, Set<string>>();
  for (const s of content.sections) for (const it of s.items) if (it.source.kind !== 'patient' && it.source.ref) byKind.set(it.source.kind, (byKind.get(it.source.kind) ?? new Set()).add(it.source.ref));
  for (const [kind, refs] of byKind) {
    const r = await query(TABLE_FOR_KIND[kind as Exclude<SourceKind, 'patient'>], [patientId, [...refs]]);
    if (r.rowCount !== refs.size) return false;
  }
  return true;
}

/** Documents the draft points at (only those in an included "documents" section). */
export function documentRefs(content: PrepContent): string[] {
  const sec = content.sections.find((s) => s.key === 'documents');
  if (!sec || !sec.included) return [];
  return [...new Set(sec.items.filter((i) => i.source.kind === 'document' && i.source.ref).map((i) => i.source.ref as string))];
}
