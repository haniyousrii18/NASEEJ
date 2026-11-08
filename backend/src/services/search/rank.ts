import { editDistance, maxEdits, normalizeSearch, tokenize } from './normalize.js';

/**
 * Hybrid ranking over one patient's own records. Everything here is pure (no database), so it is unit-tested directly.
 *
 * A record is a list of fields (title, details, notes, ...), each with an importance weight and one or more
 * "variants": the text as the patient wrote it, plus any stored translation or built-in glossary form of it. A query
 * matches a record only when EVERY query word matches somewhere in the record (words may fall in different fields).
 *
 * Each query word is matched against each word of each variant, best tier first:
 *     EXACT   4   the whole word is equal after normalization
 *     PREFIX  3   the record's word starts with the query word          (as-you-type)
 *     PART    2   the query word (3+ letters) is inside the record's word
 *     FUZZY   1   within maxEdits() edits (insert, delete, substitute, transpose); never for words under 4 letters
 * A word's score is  tier * 100 + fieldWeight * 10 - edits.  The tier always dominates, so a fuzzy hit in the title never
 * outranks an exact hit in the notes; the field weight orders matches of the same tier (title > details > notes).
 *
 * The record's score is the average of its words' scores plus a phrase bonus taken from the best-matching field:
 *     whole field equals the query  +400      field starts with the query  +200      query appears in the field  +100
 * Recency is only a tie-breaker, after score. Duplicates cannot happen: one record produces one result, however many
 * fields or language forms matched.
 */
export type Via = 'original' | 'translation' | 'glossary' | 'label';

export interface Variant {
  text: string;
  via: Via;
}

export interface Field {
  key: string;
  weight: number; // 1 (long notes) .. 3 (title)
  variants: Variant[];
}

export interface Searchable {
  ref: string;
  date: string | null;
  fields: Field[];
}

export interface Match {
  score: number;
  field: string;
  via: Via;
  text: string;
  tier: number;
}

interface Prepared {
  norm: string;
  words: string[];
  via: Via;
  text: string;
}

const prepare = (v: Variant): Prepared => {
  const norm = normalizeSearch(v.text);
  return { norm, words: tokenize(norm), via: v.via, text: v.text };
};

/** Arabic writes "the" and a few one-letter words as a prefix: الضغط = ال + ضغط, والضغط = و + ال + ضغط. Matching ignores it, in both directions. */
const ARTICLE = /^[وفبك]?ال(?=.{2})/;
const bare = (x: string) => x.replace(ARTICLE, '');

/** Best tier (0 = no match) and edit count of one query word against one record word. */
function wordTier(q: string, w: string): { tier: number; edits: number } {
  const direct = wordTierRaw(q, w);
  const qb = bare(q);
  const wb = bare(w);
  if (qb === q && wb === w) return direct;
  let best = direct;
  for (const [a, b] of [[qb, w], [q, wb], [qb, wb]] as const) {
    if (!a || !b || (a === q && b === w)) continue;
    const t = wordTierRaw(a, b);
    if (t.tier > best.tier || (t.tier === best.tier && t.edits < best.edits)) best = t;
  }
  return best;
}

function wordTierRaw(q: string, w: string): { tier: number; edits: number } {
  if (q === w) return { tier: 4, edits: 0 };
  if (w.startsWith(q)) return { tier: 3, edits: 0 };
  if (q.length >= 3 && w.includes(q)) return { tier: 2, edits: 0 };
  const allowed = maxEdits(q.length);
  if (allowed > 0) {
    let d = editDistance(q, w, allowed);
    // A typo while still typing: compare with the start of a longer word as well.
    if (d > allowed && w.length > q.length) d = Math.min(d, editDistance(q, w.slice(0, q.length), allowed));
    if (d <= allowed) return { tier: 1, edits: d };
  }
  return { tier: 0, edits: 0 };
}

/** Scores a record for a query, or returns null when it does not match every word. */
export function scoreRecord(rec: Searchable, queryNorm: string): Match | null {
  const qWords = tokenize(queryNorm);
  if (qWords.length === 0) return null;
  const fields = rec.fields.map((f) => ({ f, variants: f.variants.filter((v) => v.text).map(prepare) }));

  let total = 0;
  let minTier = 4;
  let best: { score: number; field: string; via: Via; text: string } | null = null;

  for (const q of qWords) {
    let top = -1;
    let topTier = 0;
    for (const { f, variants } of fields) {
      for (const v of variants) {
        for (const w of v.words) {
          const { tier, edits } = wordTier(q, w);
          if (tier === 0) continue;
          const s = tier * 100 + f.weight * 10 - edits;
          if (s > top) {
            top = s;
            topTier = tier;
          }
        }
      }
    }
    if (top < 0) return null;
    total += top;
    minTier = Math.min(minTier, topTier);
  }

  // The phrase bonus decides which field is reported and lifts whole-phrase matches above scattered word matches.
  let bonus = 0;
  for (const { f, variants } of fields) {
    for (const v of variants) {
      let b = 0;
      if (v.norm === queryNorm) b = 400;
      else if (v.norm.startsWith(queryNorm)) b = 200;
      else if (qWords.length > 1 ? v.norm.includes(queryNorm) : false) b = 100;
      else if (v.words.some((w) => qWords.length === 1 && w === queryNorm)) b = 120;
      const s = b + f.weight;
      if (!best || s > best.score) best = { score: s, field: f.key, via: v.via, text: v.text };
      if (b > bonus) bonus = b;
    }
  }
  // When nothing earned a phrase bonus, report the field of the strongest single word instead of an arbitrary one.
  if (bonus === 0) best = bestWordField(fields, qWords) ?? best;

  return { score: total / qWords.length + bonus, field: best?.field ?? '', via: best?.via ?? 'original', text: best?.text ?? '', tier: minTier };
}

function bestWordField(fields: Array<{ f: Field; variants: Prepared[] }>, qWords: string[]) {
  let out: { score: number; field: string; via: Via; text: string } | null = null;
  for (const { f, variants } of fields) {
    for (const v of variants) {
      let s = 0;
      for (const q of qWords) {
        let t = 0;
        for (const w of v.words) t = Math.max(t, wordTier(q, w).tier);
        s += t;
      }
      const score = s * 10 + f.weight;
      if (s > 0 && (!out || score > out.score)) out = { score, field: f.key, via: v.via, text: v.text };
    }
  }
  return out;
}

export interface Ranked<T extends Searchable> {
  rec: T;
  match: Match;
}

/** Filters to the matching records and orders them: score, then newer first, then reference (so the order is stable). */
export function rankRecords<T extends Searchable>(records: T[], query: string): Ranked<T>[] {
  const queryNorm = normalizeSearch(query);
  if (!queryNorm) return [];
  const out: Ranked<T>[] = [];
  for (const rec of records) {
    const match = scoreRecord(rec, queryNorm);
    if (match) out.push({ rec, match });
  }
  return out.sort((a, b) => b.match.score - a.match.score || (b.rec.date ?? '').localeCompare(a.rec.date ?? '') || a.rec.ref.localeCompare(b.rec.ref));
}
