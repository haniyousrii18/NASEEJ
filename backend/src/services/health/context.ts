import { query } from '../../config/db.js';
import { buildTimeline } from '../recordService.js';
import { normalizeText, type Lang } from './safety.js';

/**
 * One flat, source-labelled list of everything the patient's record holds. It feeds three things: record search,
 * the assistant's grounding context and the visit-summary draft. Every item keeps a stable `ref` so an answer can
 * point back at the exact row it came from, and an `origin` so a person-typed fact is never confused with a
 * clinician's record or an AI suggestion.
 */
export type ItemType =
  | 'condition' | 'medication' | 'allergy' | 'procedure' | 'measurement' | 'visit' | 'symptom' | 'document' | 'doc_fact'
  | 'clinician_visit' | 'clinician_prescription' | 'clinician_lab' | 'clinician_allergy' | 'appointment';

export type Origin = 'patient' | 'assistant' | 'document' | 'clinician' | 'upload' | 'ai_suggestion';

export interface RecordItem {
  ref: string; // e.g. "entry:<uuid>"
  type: ItemType;
  title: string;
  summary: string;
  date: string | null; // YYYY-MM-DD
  origin: Origin;
  documentId?: string;
}

const day = (v: unknown): string | null => {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return null;
};
const cut = (s: string | null | undefined, n = 240) => (s ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : '');
const join = (parts: Array<string | null | undefined>) => parts.filter((p): p is string => !!p && p.length > 0).join(' · ');

/** Words the server itself adds to an item's text, in the language the summary is written in. */
const WORDS = {
  ar: { severity: 'الشدة', better: 'يخففه', worse: 'يزيده', diagnosis: 'التشخيص', plan: 'الخطة', page: 'صفحة', reference: 'المرجع', active: 'حالي', past: 'سابق', mild: 'خفيفة', moderate: 'متوسطة', severe: 'شديدة', freq: { once: 'مرة واحدة', constant: 'مستمر', intermittent: 'يأتي ويذهب', daily: 'يوميًا', weekly: 'أسبوعيًا', occasional: 'أحيانًا' } as Record<string, string> },
  en: { severity: 'severity', better: 'better', worse: 'worse', diagnosis: 'diagnosis', plan: 'plan', page: 'page', reference: 'reference', active: 'active', past: 'past', mild: 'mild', moderate: 'moderate', severe: 'severe', freq: { once: 'once', constant: 'constant', intermittent: 'intermittent', daily: 'daily', weekly: 'weekly', occasional: 'occasional' } as Record<string, string> },
};

export async function buildRecordItems(patientId: string, lang: Lang): Promise<RecordItem[]> {
  const items: RecordItem[] = [];
  const W = WORDS[lang];

  const entries = await query(
    `SELECT id, kind, title, status, to_char(start_date,'YYYY-MM-DD') start_date, to_char(end_date,'YYYY-MM-DD') end_date,
            to_char(event_date,'YYYY-MM-DD') event_date, dose, frequency, reaction, severity, value, unit, provider_name, notes, source, review_status,
            created_at
     FROM health_entries WHERE patient_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200`,
    [patientId]
  );
  for (const e of entries.rows) {
    items.push({
      ref: `entry:${e.id}`,
      type: e.kind,
      title: e.title,
      summary: cut(join([e.dose, e.frequency, e.value ? `${e.value}${e.unit ? ` ${e.unit}` : ''}` : null, e.reaction, e.severity ? (W as any)[e.severity] ?? e.severity : null, e.status ? (W as any)[e.status] ?? e.status : null, e.provider_name, e.notes])),
      date: e.event_date ?? e.start_date ?? day(e.created_at),
      origin: e.source === 'clinician' ? 'clinician' : e.source,
    });
  }

  const symptoms = await query(
    `SELECT id, symptom_description, severity, onset_date, duration_text, frequency, better_factors, worse_factors, notes
     FROM symptom_reports WHERE patient_id = $1 AND deleted_at IS NULL ORDER BY onset_date DESC LIMIT 100`,
    [patientId]
  );
  for (const s of symptoms.rows) {
    items.push({
      ref: `symptom:${s.id}`,
      type: 'symptom',
      title: cut(s.symptom_description, 120),
      summary: cut(join([`${W.severity} ${s.severity}/10`, s.frequency ? W.freq[s.frequency] ?? s.frequency : null, s.duration_text, s.better_factors && `${W.better}: ${s.better_factors}`, s.worse_factors && `${W.worse}: ${s.worse_factors}`, s.notes])),
      date: day(s.onset_date),
      origin: 'patient',
    });
  }

  const docs = await query(
    `SELECT id, COALESCE(title, file_name) AS title, doc_type, provider_name, source_type, to_char(document_date,'YYYY-MM-DD') document_date, created_at
     FROM documents WHERE patient_id = $1 AND deleted_at IS NULL AND visible_to_patient = TRUE ORDER BY COALESCE(document_date::timestamptz, created_at) DESC LIMIT 100`,
    [patientId]
  );
  for (const d of docs.rows) {
    items.push({
      ref: `document:${d.id}`,
      type: 'document',
      title: d.title,
      summary: cut(join([d.doc_type, d.provider_name])),
      date: d.document_date ?? day(d.created_at),
      origin: d.source_type === 'patient_uploaded' ? 'upload' : 'clinician',
      documentId: d.id,
    });
  }

  // AI suggestions the patient has not decided on yet: searchable, but always labelled as unconfirmed.
  const facts = await query(
    `SELECT f.id, f.document_id, f.kind, f.label, f.value, f.unit, to_char(f.fact_date,'YYYY-MM-DD') fact_date, f.source_page, f.source_passage
     FROM document_facts f JOIN documents d ON d.id = f.document_id
     WHERE f.patient_id = $1 AND d.deleted_at IS NULL AND f.patient_decision IS NULL AND f.review_status <> 'rejected'
     ORDER BY f.created_at DESC LIMIT 80`,
    [patientId]
  );
  for (const f of facts.rows) {
    items.push({
      ref: `fact:${f.id}`,
      type: 'doc_fact',
      title: f.label,
      summary: cut(join([f.value ? `${f.value}${f.unit ? ` ${f.unit}` : ''}` : null, f.source_page ? `${W.page} ${f.source_page}` : null, f.source_passage && `"${f.source_passage}"`])),
      date: f.fact_date,
      origin: 'ai_suggestion',
      documentId: f.document_id,
    });
  }

  // What clinicians recorded and released (approved only; drafts never reach the patient).
  const timeline = await buildTimeline({ kind: 'patient', patientId }, { types: ['visit', 'prescription', 'lab_result', 'appointment'], limit: 120 });
  for (const t of timeline.items) {
    const d: any = t.data;
    if (t.type === 'visit') {
      items.push({ ref: `visit:${t.source.id}`, type: 'clinician_visit', title: cut(d.chiefComplaint, 120) || 'Visit', summary: cut(join([d.diagnosis && `${W.diagnosis}: ${d.diagnosis}`, d.treatmentPlan && `${W.plan}: ${d.treatmentPlan}`])), date: day(t.occurredAt), origin: 'clinician' });
    } else if (t.type === 'prescription') {
      const meds = Array.isArray(d.items) ? d.items : [];
      items.push({
        ref: `rx:${t.source.id}`,
        type: 'clinician_prescription',
        title: cut(meds.map((m: any) => m.medication_name).join(', '), 140) || 'Prescription',
        summary: cut(meds.map((m: any) => join([meds.length > 1 ? m.medication_name : null, m.dosage, m.frequency, m.duration])).join('; ')),
        date: day(t.occurredAt),
        origin: 'clinician',
      });
    } else if (t.type === 'lab_result') {
      items.push({ ref: `lab:${t.source.id}`, type: 'clinician_lab', title: String(d.parameterName ?? 'Lab result'), summary: cut(join([`${d.value ?? ''}${d.unit ? ` ${d.unit}` : ''}`.trim(), d.referenceRange && `${W.reference} ${d.referenceRange}`])), date: day(t.occurredAt), origin: 'clinician' });
    } else if (t.type === 'appointment') {
      items.push({ ref: `appt:${t.source.id}`, type: 'appointment', title: `Appointment ${d.date} ${d.startTime}`, summary: cut(join([d.status, d.reason])), date: d.date, origin: 'clinician' });
    }
  }

  const allergies = await query(
    `SELECT id, allergen_ar, allergen_en, reaction_ar, reaction_en, severity, to_char(diagnosed_at,'YYYY-MM-DD') diagnosed_at FROM patient_allergies WHERE patient_id = $1`,
    [patientId]
  );
  for (const a of allergies.rows) {
    const name = (lang === 'ar' ? a.allergen_ar || a.allergen_en : a.allergen_en || a.allergen_ar) as string;
    const reaction = (lang === 'ar' ? a.reaction_ar || a.reaction_en : a.reaction_en || a.reaction_ar) as string | null;
    items.push({ ref: `allergy:${a.id}`, type: 'clinician_allergy', title: name, summary: cut(join([reaction, a.severity])), date: a.diagnosed_at, origin: 'clinician' });
  }

  return items;
}

/** Items whose text contains every word of the query (case, Arabic letter variants and diacritics ignored). */
export function searchItems(items: RecordItem[], q: string): RecordItem[] {
  const words = normalizeText(q).split(' ').filter((w) => w.length > 0);
  if (words.length === 0) return [];
  return items.filter((i) => {
    const hay = normalizeText(`${i.title} ${i.summary} ${i.type}`);
    return words.every((w) => hay.includes(w));
  });
}

/**
 * The model never sees UUIDs: each item gets a short alias (R1, R2, ...). The server maps the aliases the model cites
 * back to real refs and drops any alias that was not in the list, so a made-up source cannot reach the patient.
 */
export function toPromptContext(items: RecordItem[], max = 220): { text: string; aliasToItem: Map<string, RecordItem> } {
  const aliasToItem = new Map<string, RecordItem>();
  const originLabel: Record<Origin, string> = {
    patient: 'typed by the patient',
    assistant: 'drafted in chat and confirmed by the patient',
    document: 'from a document, confirmed by the patient',
    clinician: 'recorded by a clinician',
    upload: 'uploaded by the patient',
    ai_suggestion: 'UNCONFIRMED machine reading of a document',
  };
  const lines = items.slice(0, max).map((i, idx) => {
    const alias = `R${idx + 1}`;
    aliasToItem.set(alias, i);
    return `${alias} | ${i.type} | ${i.date ?? 'no date'} | ${i.title}${i.summary ? ` | ${i.summary}` : ''} | ${originLabel[i.origin]}`;
  });
  return { text: lines.join('\n'), aliasToItem };
}
