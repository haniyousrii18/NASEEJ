import { query } from '../../config/db.js';
import { buildRecordItems, type Origin } from '../health/context.js';
import { glossaryTranslate } from '../translation/glossary/engine.js';
import { detectLang } from '../translation/language.js';
import { hashOf } from '../translation/service.js';
import { cleanQuery, normalizeSearch } from './normalize.js';
import { rankRecords, type Field, type Searchable, type Variant, type Via } from './rank.js';

/**
 * Record search for one signed-in patient.
 *
 * How it works (and why there is no separate index):
 *  1. Load the patient's own live rows from PostgreSQL, filtered by patient_id taken from the session and by
 *     deleted_at IS NULL. Because the source of truth is read on every request, a record created or edited a moment ago
 *     is found, and a deleted one is gone, with nothing to rebuild and nothing that can go stale or leak.
 *  2. Attach, to each text, its explicit aliases in the other language: the translation stored for exactly that text in
 *     content_translations (keyed by a SHA-256 of the original, so an edited text never inherits an old translation),
 *     and the built-in medical glossary (a fixed local dictionary, no model, no network). Nothing is invented here, and
 *     the patient's original text is what every result returns.
 *  3. Rank in process with the hybrid exact / prefix / part-word / typo-tolerant scorer in rank.ts.
 * A patient's record is a few hundred rows, so this is cheap; the per-type row caps below bound the worst case. If a
 * deployment ever needs more than that, a pg_trgm/tsvector column per table can replace step 1's scan without touching
 * the ranking or the API.
 */
export const SEARCH_TYPES = ['condition', 'medication', 'allergy', 'procedure', 'measurement', 'visit', 'symptom', 'document', 'prep', 'clinician', 'doc_fact'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

const CAPS = { entries: 500, symptoms: 300, documents: 300, preps: 100, allergies: 100 };
const MAX_TEXT = 2000;

/** The words people use for a kind of record, both languages: a match here ranks low (weight 1) but lets "allergy" or "حساسية" list them all. */
const LABELS: Record<string, string[]> = {
  condition: ['condition', 'diagnosis', 'حالة', 'تشخيص', 'مرض'],
  medication: ['medicine', 'medication', 'drug', 'دواء', 'علاج'],
  allergy: ['allergy', 'حساسية'],
  procedure: ['procedure', 'surgery', 'operation', 'عملية', 'جراحة', 'إجراء'],
  measurement: ['measurement', 'reading', 'قياس', 'قراءة'],
  visit: ['visit', 'appointment', 'زيارة', 'موعد'],
  symptom: ['symptom', 'عرض', 'أعراض'],
  document: ['document', 'file', 'مستند', 'ملف'],
  prep: ['summary', 'visit summary', 'ملخص', 'ملخص زيارة'],
  lab_report: ['lab report', 'lab test', 'test result', 'تقرير تحاليل', 'تحليل', 'نتيجة'],
  imaging_report: ['imaging', 'x-ray', 'scan', 'أشعة', 'تصوير'],
  prescription: ['prescription', 'وصفة', 'روشتة'],
  discharge_summary: ['discharge summary', 'ملخص خروج'],
  clinical_note: ['clinical note', 'ملاحظة طبية'],
  referral: ['referral', 'تحويل'],
  vaccination_record: ['vaccination', 'vaccine', 'تطعيم', 'لقاح'],
  administrative: ['administrative', 'إداري'],
};

export interface SearchHit {
  ref: string;
  type: string;
  id: string;
  title: string;
  summary: string;
  date: string | null;
  origin: Origin;
  documentId?: string;
  score: number;
  /** Where the words were found: the field, whether through the original text, a stored translation or the glossary, and that text. */
  matched: { field: string; via: Via; text: string };
}

interface Rec extends Searchable {
  type: string;
  id: string;
  title: string;
  summary: string;
  origin: Origin;
  documentId?: string;
}

const clip = (s: string | null | undefined, n = MAX_TEXT) => (s ? s.slice(0, n) : '');
const orig = (text: string | null | undefined): Variant[] => (text && text.trim() ? [{ text: clip(text.trim()), via: 'original' }] : []);
const field = (key: string, weight: number, ...texts: Array<string | null | undefined>): Field => ({ key, weight, variants: texts.flatMap(orig) });
const label = (...keys: string[]): Field => ({ key: 'type', weight: 1, variants: keys.flatMap((k) => (LABELS[k] ?? []).map((text) => ({ text, via: 'label' as const }))) });
const day = (v: unknown): string | null => (typeof v === 'string' ? v.slice(0, 10) : v instanceof Date ? v.toISOString().slice(0, 10) : null);
const join = (parts: Array<string | null | undefined>) => parts.filter((p): p is string => !!p && p.trim().length > 0).join(' · ');

const wants = (types: ReadonlySet<string> | null, ...names: string[]) => !types || names.some((n) => types.has(n));

/** Loads the patient's records as searchable shapes. `deleted` switches the documents to the trash (used by the trash view). */
async function loadRecords(patientId: string, types: ReadonlySet<string> | null, lang: 'ar' | 'en', deleted: boolean): Promise<Rec[]> {
  const recs: Rec[] = [];
  const jobs: Array<Promise<void>> = [];

  const entryKinds = ['condition', 'medication', 'allergy', 'procedure', 'measurement', 'visit'];
  if (!deleted && entryKinds.some((k) => wants(types, k))) {
    jobs.push(
      query(
        `SELECT id, kind, title, dose, frequency, reaction, severity, value, unit, provider_name, notes, source,
                to_char(COALESCE(event_date, start_date, created_at::date),'YYYY-MM-DD') AS d
         FROM health_entries WHERE patient_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT $2`,
        [patientId, CAPS.entries],
      ).then((r) => {
        for (const e of r.rows) {
          if (types && !types.has(e.kind)) continue;
          recs.push({
            ref: `entry:${e.id}`, type: e.kind, id: e.id, title: e.title, summary: join([e.dose, e.frequency, e.reaction, e.value ? `${e.value}${e.unit ? ` ${e.unit}` : ''}` : null, e.provider_name]),
            date: e.d, origin: e.source === 'clinician' ? 'clinician' : e.source,
            fields: [field('title', 3, e.title), field('details', 2, e.dose, e.frequency, e.reaction, e.value ? `${e.value}${e.unit ? ` ${e.unit}` : ''}` : null, e.provider_name), field('notes', 1, e.notes), label(e.kind)],
          });
        }
      }),
    );
  }

  if (!deleted && wants(types, 'symptom')) {
    jobs.push(
      query(
        `SELECT id, symptom_description, duration_text, better_factors, worse_factors, notes, to_char(onset_date,'YYYY-MM-DD') AS d
         FROM symptom_reports WHERE patient_id = $1 AND deleted_at IS NULL ORDER BY onset_date DESC LIMIT $2`,
        [patientId, CAPS.symptoms],
      ).then((r) => {
        for (const s of r.rows) {
          recs.push({
            ref: `symptom:${s.id}`, type: 'symptom', id: s.id, title: clip(s.symptom_description, 160), summary: join([s.duration_text, s.notes]), date: s.d, origin: 'patient',
            fields: [field('title', 3, s.symptom_description), field('details', 2, s.duration_text, s.better_factors, s.worse_factors), field('notes', 1, s.notes), label('symptom')],
          });
        }
      }),
    );
  }

  if (wants(types, 'document')) {
    jobs.push(
      query(
        `SELECT id, COALESCE(title, file_name) AS title, file_name, doc_type, provider_name, source_type,
                to_char(COALESCE(document_date, created_at::date),'YYYY-MM-DD') AS d
         FROM documents WHERE patient_id = $1 AND visible_to_patient = TRUE AND deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'}
         ORDER BY COALESCE(document_date::timestamptz, created_at) DESC LIMIT $2`,
        [patientId, CAPS.documents],
      ).then((r) => {
        for (const d of r.rows) {
          recs.push({
            ref: `document:${d.id}`, type: 'document', id: d.id, title: d.title, summary: join([d.doc_type, d.provider_name]), date: d.d,
            origin: d.source_type === 'patient_uploaded' ? 'upload' : 'clinician', documentId: d.id,
            fields: [field('title', 3, d.title), field('provider', 2, d.provider_name), field('file', 1, d.file_name), label('document', d.doc_type ?? 'document')],
          });
        }
      }),
    );
  }

  if (!deleted && wants(types, 'prep')) {
    jobs.push(
      query(`SELECT id, status, content, to_char(COALESCE(visit_date, updated_at::date),'YYYY-MM-DD') AS d FROM visit_preps WHERE patient_id = $1 ORDER BY updated_at DESC LIMIT $2`, [patientId, CAPS.preps]).then((r) => {
        for (const p of r.rows) {
          const reason = typeof p.content?.reason === 'string' ? p.content.reason : '';
          const overview = typeof p.content?.overview === 'string' ? p.content.overview : '';
          recs.push({
            ref: `prep:${p.id}`, type: 'prep', id: p.id, title: clip(reason, 160), summary: clip(overview, 160), date: p.d, origin: 'patient',
            fields: [field('title', 3, reason), field('notes', 1, overview), label('prep')],
          });
        }
      }),
    );
  }

  // What clinicians recorded: the stored Arabic and English names of an allergy are both searchable as written.
  if (!deleted && wants(types, 'allergy', 'clinician')) {
    jobs.push(
      query(`SELECT id, allergen_ar, allergen_en, reaction_ar, reaction_en, severity, to_char(diagnosed_at,'YYYY-MM-DD') AS d FROM patient_allergies WHERE patient_id = $1 LIMIT $2`, [patientId, CAPS.allergies]).then((r) => {
        for (const a of r.rows) {
          const name = (lang === 'ar' ? a.allergen_ar || a.allergen_en : a.allergen_en || a.allergen_ar) as string;
          const reaction = (lang === 'ar' ? a.reaction_ar || a.reaction_en : a.reaction_en || a.reaction_ar) as string | null;
          recs.push({
            ref: `allergy:${a.id}`, type: 'clinician_allergy', id: a.id, title: name, summary: join([reaction, a.severity]), date: a.d, origin: 'clinician',
            fields: [field('title', 3, a.allergen_ar, a.allergen_en), field('details', 2, a.reaction_ar, a.reaction_en), label('allergy')],
          });
        }
      }),
    );
  }

  // Clinician visits, prescriptions, lab results and unconfirmed document readings come from the shared record builder.
  if (!deleted && wants(types, 'clinician', 'doc_fact')) {
    jobs.push(
      buildRecordItems(patientId, lang).then((items) => {
        for (const i of items) {
          const isFact = i.type === 'doc_fact';
          if (i.type === 'clinician_allergy') continue; // loaded above, in both languages
          if (!(isFact ? wants(types, 'doc_fact') : (i.type.startsWith('clinician_') || i.type === 'appointment') && wants(types, 'clinician'))) continue;
          recs.push({
            ref: i.ref, type: i.type, id: i.ref.split(':')[1] ?? i.ref, title: i.title, summary: i.summary, date: i.date, origin: i.origin, documentId: i.documentId,
            fields: [field('title', 3, i.title), field('details', 1, i.summary)],
          });
        }
      }),
    );
  }

  await Promise.all(jobs);
  return recs;
}

/** Adds the stored translation and glossary form of every original text as extra variants of the same field. */
async function attachAliases(patientId: string, recs: Rec[]): Promise<void> {
  const texts = new Map<string, string>(); // hash -> trimmed original
  for (const r of recs) for (const f of r.fields) for (const v of f.variants) if (v.via === 'original' && /\p{L}/u.test(v.text)) texts.set(hashOf(v.text.trim()), v.text.trim());
  if (texts.size === 0) return;

  const stored = new Map<string, string[]>(); // hash -> translations (either language)
  const hashes = [...texts.keys()];
  for (let i = 0; i < hashes.length; i += 500) {
    const rows = await query('SELECT source_hash, translated_text FROM content_translations WHERE patient_id = $1 AND source_hash = ANY($2::char(64)[])', [patientId, hashes.slice(i, i + 500)]);
    for (const row of rows.rows) {
      const k = String(row.source_hash).trim();
      stored.set(k, [...(stored.get(k) ?? []), row.translated_text]);
    }
  }

  for (const r of recs) {
    for (const f of r.fields) {
      const extra: Variant[] = [];
      for (const v of f.variants) {
        if (v.via !== 'original') continue;
        const t = v.text.trim();
        const h = hashOf(t);
        const have = stored.get(h);
        if (have) for (const text of have) extra.push({ text, via: 'translation' });
        else {
          // No stored translation: the fixed glossary may still know it. Only when it covers the whole text.
          const lang = detectLang(t);
          const g = lang === 'ar' ? glossaryTranslate(t, 'en') : lang === 'en' ? glossaryTranslate(t, 'ar') : null;
          if (g && normalizeSearch(g) !== normalizeSearch(t)) extra.push({ text: g, via: 'glossary' });
        }
      }
      f.variants.push(...extra);
    }
  }
}

export interface SearchOptions {
  types?: string[];
  limit?: number;
  offset?: number;
  lang?: 'ar' | 'en';
  deleted?: boolean;
}

const expandTypes = (types?: string[]): ReadonlySet<string> | null => {
  if (!types || types.length === 0) return null;
  const ok = types.filter((t): t is SearchType => (SEARCH_TYPES as readonly string[]).includes(t));
  return ok.length > 0 ? new Set(ok) : new Set(['__none__']);
};

export const MIN_QUERY = 2;
export const MAX_QUERY = 100;

export async function searchRecords(patientId: string, rawQuery: unknown, opts: SearchOptions = {}): Promise<{ hits: SearchHit[]; total: number }> {
  const q = cleanQuery(rawQuery, MAX_QUERY);
  const normalized = normalizeSearch(q);
  if (normalized.length < MIN_QUERY) return { hits: [], total: 0 };
  const types = expandTypes(opts.types);
  const recs = await loadRecords(patientId, types, opts.lang ?? 'ar', !!opts.deleted);
  await attachAliases(patientId, recs);
  const ranked = rankRecords(recs, q);
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const hits = ranked.slice(offset, offset + limit).map(({ rec, match }) => ({
    ref: rec.ref, type: rec.type, id: rec.id, title: rec.title, summary: rec.summary, date: rec.date, origin: rec.origin, documentId: rec.documentId,
    score: Math.round(match.score), matched: { field: match.field, via: match.via, text: match.text.slice(0, 200) },
  }));
  return { hits, total: ranked.length };
}

/** The ids of the records that match, best first. Lists (documents, entries, symptoms) filter by these, so every list searches the same way. */
export async function searchIds(patientId: string, rawQuery: unknown, types: string[], opts: { deleted?: boolean; lang?: 'ar' | 'en' } = {}): Promise<string[] | null> {
  const q = cleanQuery(rawQuery, MAX_QUERY);
  if (normalizeSearch(q).length < MIN_QUERY) return null; // too short to filter by: the list is shown whole
  const recs = await loadRecords(patientId, expandTypes(types), opts.lang ?? 'ar', !!opts.deleted);
  await attachAliases(patientId, recs);
  return rankRecords(recs, q).map((r) => r.rec.id);
}
