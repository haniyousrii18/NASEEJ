import { isIsoDate } from '../validation.js';

/**
 * Validation for what a patient types (or confirms) into their own record. Pure functions, no database:
 * the routes call them, the assistant reuses them to check a drafted symptom, and the tests exercise them directly.
 */
export const ENTRY_KINDS = ['condition', 'medication', 'allergy', 'procedure', 'measurement', 'visit'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const FREQUENCIES = ['once', 'constant', 'intermittent', 'daily', 'weekly', 'occasional'] as const;

/** A failure carries an English `message` for logs and API users, and a stable `rule` (+ `params`) the app words in the page language. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string; rule: string; params?: Record<string, string | number> };

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();

/** Optional text: undefined when absent, null when cleared, a trimmed string otherwise, or an error marker. */
function text(body: any, key: string, max: number): string | null | undefined | { bad: true } {
  if (!(key in body)) return undefined;
  const v = body[key];
  if (v === null || v === '') return null;
  if (typeof v !== 'string') return { bad: true };
  const t = clean(v);
  if (t.length > max) return { bad: true };
  return t || null;
}

const isBad = (v: unknown): v is { bad: true } => typeof v === 'object' && v !== null && (v as any).bad === true;

function date(body: any, key: string): string | null | undefined | { bad: true } {
  if (!(key in body)) return undefined;
  const v = body[key];
  if (v === null || v === '') return null;
  return isIsoDate(v) ? v : { bad: true };
}

const todayIso = () => new Date().toISOString().slice(0, 10);

interface FieldSpec {
  text: Array<[string, number]>;
  dates: string[];
}

const TEXT_FIELDS: Array<[string, number]> = [
  ['title', 255],
  ['dose', 120],
  ['frequency', 120],
  ['reaction', 255],
  ['value', 60],
  ['unit', 30],
  ['provider_name', 200],
  ['notes', 2000],
];
const DATE_FIELDS = ['start_date', 'end_date', 'event_date'];
const SPEC: FieldSpec = { text: TEXT_FIELDS, dates: DATE_FIELDS };

/** Which fields mean something for each kind. Anything else sent for that kind is ignored, never stored. */
const KIND_FIELDS: Record<EntryKind, string[]> = {
  condition: ['title', 'status', 'start_date', 'end_date', 'notes'],
  medication: ['title', 'dose', 'frequency', 'status', 'start_date', 'end_date', 'provider_name', 'notes'],
  allergy: ['title', 'reaction', 'severity', 'notes'],
  procedure: ['title', 'event_date', 'provider_name', 'notes'],
  measurement: ['title', 'value', 'unit', 'event_date', 'notes'],
  visit: ['title', 'event_date', 'provider_name', 'notes'],
};

export function parseEntry(body: any, opts: { partial: boolean; kind?: EntryKind }): Parsed<Record<string, unknown>> {
  if (!body || typeof body !== 'object') return { ok: false, message: 'A JSON body is required.', rule: 'jsonBody' };
  const kind: EntryKind | undefined = opts.kind ?? body.kind;
  if (!kind || !(ENTRY_KINDS as readonly string[]).includes(kind)) return { ok: false, message: `kind must be one of: ${ENTRY_KINDS.join(', ')}.`, rule: 'kind' };

  const out: Record<string, unknown> = {};
  const allowed = new Set(KIND_FIELDS[kind]);

  for (const [key, max] of SPEC.text) {
    if (!allowed.has(key)) continue;
    const v = text(body, key, max);
    if (isBad(v)) return { ok: false, message: `${key} must be text of at most ${max} characters.`, rule: 'textTooLong', params: { field: key, max } };
    if (v !== undefined) out[key] = v;
  }
  for (const key of SPEC.dates) {
    if (!allowed.has(key)) continue;
    const v = date(body, key);
    if (isBad(v)) return { ok: false, message: `${key} must use the YYYY-MM-DD format.`, rule: 'dateFormat', params: { field: key } };
    if (v !== undefined) out[key] = v;
  }
  if (allowed.has('status') && 'status' in body) {
    if (body.status !== null && body.status !== 'active' && body.status !== 'past') return { ok: false, message: 'status must be active or past.', rule: 'status' };
    out.status = body.status ?? null;
  }
  if (allowed.has('severity') && 'severity' in body) {
    if (body.severity !== null && !['mild', 'moderate', 'severe'].includes(body.severity)) return { ok: false, message: 'severity must be mild, moderate or severe.', rule: 'severityLevel' };
    out.severity = body.severity ?? null;
  }

  if (!opts.partial) {
    if (!out.title) return { ok: false, message: 'A title is required.', rule: 'titleRequired' };
    if (kind === 'measurement' && (!out.value || !out.event_date)) return { ok: false, message: 'A measurement needs a value and a date.', rule: 'measurementNeeds' };
    if ((kind === 'visit' || kind === 'procedure') && !out.event_date) return { ok: false, message: 'A date is required.', rule: 'dateRequired' };
    if ((kind === 'condition' || kind === 'medication') && !out.status) out.status = 'active';
  } else if ('title' in out && !out.title) {
    return { ok: false, message: 'The title cannot be empty.', rule: 'titleEmpty' };
  }

  const today = todayIso();
  if (typeof out.event_date === 'string' && kind !== 'visit' && out.event_date > today) return { ok: false, message: 'This date cannot be in the future.', rule: 'futureDate' };
  if (typeof out.start_date === 'string' && out.start_date > today && kind === 'condition') return { ok: false, message: 'The start date cannot be in the future.', rule: 'futureStart' };
  if (typeof out.start_date === 'string' && typeof out.end_date === 'string' && out.end_date < out.start_date) return { ok: false, message: 'The end date cannot be before the start date.', rule: 'endBeforeStart' };
  return { ok: true, value: out };
}

export interface SymptomInput {
  symptom_description?: string;
  severity?: number;
  onset_date?: string;
  duration_text?: string | null;
  frequency?: string | null;
  better_factors?: string | null;
  worse_factors?: string | null;
  notes?: string | null;
}

/** An onset may be a calendar day or a full ISO time. It can not be in the future (5 minutes of clock drift allowed). */
export function parseOnset(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (isIsoDate(v)) return `${v}T00:00:00.000Z` <= new Date().toISOString() ? `${v}T00:00:00.000Z` : null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t) || t > Date.now() + 5 * 60_000) return null;
  return new Date(t).toISOString();
}

export function parseSymptom(body: any, opts: { partial: boolean }): Parsed<SymptomInput> {
  if (!body || typeof body !== 'object') return { ok: false, message: 'A JSON body is required.', rule: 'jsonBody' };
  const out: SymptomInput = {};

  if ('symptom_description' in body || !opts.partial) {
    const d = typeof body.symptom_description === 'string' ? clean(body.symptom_description) : '';
    if (!d || d.length > 1000) return { ok: false, message: 'Describe the symptom in up to 1000 characters.', rule: 'symptomDescription' };
    out.symptom_description = d;
  }
  if ('severity' in body || !opts.partial) {
    const s = body.severity;
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 1 || s > 10) return { ok: false, message: 'severity must be a whole number from 1 to 10.', rule: 'symptomSeverity' };
    out.severity = s;
  }
  if ('onset_date' in body || !opts.partial) {
    const o = body.onset_date === undefined && !opts.partial ? new Date().toISOString() : parseOnset(body.onset_date);
    if (!o) return { ok: false, message: 'The start date must be a valid date that is not in the future.', rule: 'symptomOnset' };
    out.onset_date = o;
  }
  const limits: Array<[keyof SymptomInput, number]> = [
    ['duration_text', 100],
    ['better_factors', 500],
    ['worse_factors', 500],
    ['notes', 2000],
  ];
  for (const [key, max] of limits) {
    const v = text(body, key, max);
    if (isBad(v)) return { ok: false, message: `${key} must be text of at most ${max} characters.`, rule: 'textTooLong', params: { field: key, max } };
    if (v !== undefined) (out as any)[key] = v;
  }
  if ('frequency' in body) {
    if (body.frequency !== null && body.frequency !== '' && !(FREQUENCIES as readonly string[]).includes(body.frequency)) return { ok: false, message: `frequency must be one of: ${FREQUENCIES.join(', ')}.`, rule: 'frequency' };
    out.frequency = body.frequency || null;
  }
  return { ok: true, value: out };
}
