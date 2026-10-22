import { createHash } from 'crypto';
import { query } from '../../config/db.js';
import { ENV } from '../../config/env.js';
import { detectLang } from './language.js';
import { getTranslationProvider, type Lang, type TranslationOutput } from './provider.js';

/**
 * Translation of typed text, read-through and stored.
 *  1. Text already in the target language, or with no language (numbers, measurements), needs nothing: status "same".
 *  2. Otherwise the stored translation for (patient, original text, target) is returned if there is one.
 *  3. Otherwise the configured non-AI provider is asked, its answer is checked (numbers must survive), stored, and returned.
 *  4. With no provider, or when it cannot translate faithfully, the answer is "unavailable" and the client shows the original.
 * Nothing here calls the assistant or any AI feature.
 */
export type Reason = 'no_provider' | 'mixed' | 'uncertain' | 'failed' | 'not_allowed';
export type TranslationResult =
  | { status: 'same' }
  | { status: 'ok'; text: string; from: Lang; provider: string }
  | { status: 'unavailable'; reason: Reason };

export const MAX_TEXTS = 20;
export const MAX_TEXT_LENGTH = 2000;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

export function parseTexts(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TEXTS) return null;
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string') return null;
    const clean = t.replace(CONTROL, '').trim();
    if (!clean || clean.length > MAX_TEXT_LENGTH) return null;
    out.push(clean);
  }
  return out;
}

export const parseTarget = (raw: unknown): Lang | null => (raw === 'ar' || raw === 'en' ? raw : null);

export const hashOf = (text: string) => createHash('sha256').update(text).digest('hex');

// ------------------------------------------------------------------------------------------------ number safety

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/** Every run of digits in the text as Western digits. */
export function numbersIn(text: string): string[] {
  const western = text
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_INDIC.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',');
  return (western.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, ''));
}

/** Arabic says "2 days" as one dual word with no digit. Only these exact words may stand in for a "2". */
const ARABIC_DUAL = /(?:^|[^؀-ۿ])(?:يومين|يومان|أسبوعين|اسبوعين|شهرين|ساعتين|دقيقتين|ليلتين|سنتين|عامين|مرتين|جرعتين|حبتين|قرصين|كبسولتين)(?![؀-ۿ])/;

/** True when the translation carries the same numbers as the original. Nothing may be added or changed. */
export function preservesNumbers(original: string, translated: string): boolean {
  const a = numbersIn(original).sort();
  const b = numbersIn(translated).sort();
  if (a.length === b.length && a.every((n, i) => n === b[i])) return true;
  const rest = [...a];
  for (const n of b) {
    const i = rest.indexOf(n);
    if (i < 0) return false;
    rest.splice(i, 1);
  }
  return rest.length > 0 && rest.every((n) => n === '2') && ARABIC_DUAL.test(translated);
}

// ------------------------------------------------------------------------------------------------ the service

export async function translateForPatient(patientId: string, texts: string[], target: Lang): Promise<TranslationResult[]> {
  const results: Array<TranslationResult | undefined> = texts.map((t) => {
    const lang = detectLang(t);
    if (lang === target || lang === 'none') return { status: 'same' };
    if (lang === 'mixed') return { status: 'unavailable', reason: 'mixed' };
    return undefined;
  });
  const todo = texts.map((t, i) => i).filter((i) => !results[i]);
  if (todo.length === 0) return results as TranslationResult[];

  const from: Lang = target === 'en' ? 'ar' : 'en';
  const hashes = todo.map((i) => hashOf(texts[i]));

  const stored = await query(
    'SELECT source_hash, translated_text, provider FROM content_translations WHERE patient_id = $1 AND target_lang = $2 AND source_hash = ANY($3::char(64)[])',
    [patientId, target, hashes],
  );
  const byHash = new Map<string, { text: string; provider: string }>(stored.rows.map((r) => [r.source_hash.trim(), { text: r.translated_text, provider: r.provider }]));
  const misses: number[] = [];
  todo.forEach((i, k) => {
    const hit = byHash.get(hashes[k]);
    if (hit) results[i] = { status: 'ok', text: hit.text, from, provider: hit.provider };
    else misses.push(i);
  });
  if (stored.rowCount) {
    // Keep the 90-day prune from removing what is still in use, without a write on every read.
    void query(`UPDATE content_translations SET last_used_at = NOW() WHERE patient_id = $1 AND target_lang = $2 AND source_hash = ANY($3::char(64)[]) AND last_used_at < NOW() - INTERVAL '1 day'`, [patientId, target, hashes]).catch(() => undefined);
  }
  if (misses.length === 0) return results as TranslationResult[];

  const provider = getTranslationProvider(ENV.TRANSLATION_PROVIDER);
  if (!provider) {
    for (const i of misses) results[i] = { status: 'unavailable', reason: 'no_provider' };
    return results as TranslationResult[];
  }

  let out: TranslationOutput[] = [];
  try {
    out = await provider.translate(misses.map((i) => texts[i]), from, target);
  } catch {
    for (const i of misses) results[i] = { status: 'unavailable', reason: 'failed' };
    return results as TranslationResult[];
  }
  for (let k = 0; k < misses.length; k++) {
    const i = misses[k];
    const made = out[k];
    const engine = made && typeof made === 'object' ? made.engine : provider.name;
    const candidate = typeof made === 'string' ? made.replace(CONTROL, '').trim() : made && typeof made === 'object' ? made.text.replace(CONTROL, '').trim() : '';
    if (!candidate || !preservesNumbers(texts[i], candidate)) {
      results[i] = { status: 'unavailable', reason: 'uncertain' };
      continue;
    }
    results[i] = { status: 'ok', text: candidate, from, provider: engine };
    await query(
      `INSERT INTO content_translations (patient_id, source_hash, target_lang, source_lang, translated_text, provider)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (patient_id, source_hash, target_lang) DO UPDATE SET translated_text = EXCLUDED.translated_text, provider = EXCLUDED.provider, last_used_at = NOW()`,
      [patientId, hashOf(texts[i]), target, from, candidate, engine],
    ).catch(() => undefined);
  }
  return results as TranslationResult[];
}

/** Every string anywhere inside a value, for checking that a share only translates what it actually contains. */
export function stringsIn(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') out.add(value.replace(CONTROL, '').trim());
  else if (Array.isArray(value)) value.forEach((v) => stringsIn(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => stringsIn(v, out));
  return out;
}

/** Translations nobody has looked up for 90 days are dropped. Called on the same timer as the share scrub. */
export async function pruneStaleTranslations(): Promise<number> {
  const r = await query(`DELETE FROM content_translations WHERE last_used_at < NOW() - INTERVAL '90 days'`);
  return r.rowCount ?? 0;
}
