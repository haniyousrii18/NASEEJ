/**
 * Search normalization, shared in shape by the server (ranking) and the browser (highlighting). The browser keeps a copy
 * at frontend/src/app/search/normalize.ts; tests on both sides run the same fixtures so they cannot drift apart.
 *
 * What is folded together (the text shown to the patient is never changed, only the copy used for matching):
 *   - case; Unicode compatibility forms (NFKC) and Latin accents (é → e);
 *   - Arabic diacritics (tashkeel), dagger alef, Quranic marks and tatweel;
 *   - alef forms أ إ آ ٱ → ا;  ى → ي;  ئ → ي;  ؤ → و;  ة → ه;  Persian ی → ي and ک → ك;
 *   - Arabic-Indic and Persian digits → 0-9;  punctuation and zero-width marks → a single space.
 * What is deliberately NOT folded: ء (a letter of its own), ه vs ح vs خ, ص vs س and every other distinct consonant, so two
 * different clinical words are never merged. Latin and Arabic are never mapped onto each other here: crossing scripts is
 * done only through stored translations (see corpus.ts), never by guessing.
 */

const MARKS = /[ً-ٰٟۖ-ۭـ̀-ͯ]/;
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿­]/;

const LETTER_MAP: Record<string, string> = {
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
  'ى': 'ي', 'ئ': 'ي', 'ی': 'ي', 'ې': 'ي', 'ۍ': 'ي',
  'ؤ': 'و',
  'ة': 'ه', 'ہ': 'ه', 'ھ': 'ه',
  'ک': 'ك', 'گ': 'ك',
};

const digitOf = (cp: string): string | null => {
  const c = cp.codePointAt(0)!;
  if (c >= 0x0660 && c <= 0x0669) return String(c - 0x0660);
  if (c >= 0x06f0 && c <= 0x06f9) return String(c - 0x06f0);
  return null;
};

export interface Normalized {
  /** The text used for matching. */
  text: string;
  /** For each character of `text`, the index in the original string where it came from (for highlighting). */
  map: number[];
}

/** Normalizes while remembering where every kept character came from in the original string. */
export function normalizeWithMap(input: string): Normalized {
  const out: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;
  let i = 0;
  for (const ch of input) {
    const at = i;
    i += ch.length;
    if (INVISIBLE.test(ch)) continue;
    // NFKC may expand one character (ﬁ → fi); NFD splits accents off so they can be dropped.
    const decomposed = ch.normalize('NFKC').normalize('NFD');
    for (const part of decomposed) {
      if (MARKS.test(part)) continue;
      const digit = digitOf(part);
      const folded = digit ?? LETTER_MAP[part] ?? part.toLowerCase();
      if ([...folded].every((c) => /[\p{L}\p{N}]/u.test(c))) {
        if (pendingSpace && out.length > 0) {
          out.push(' ');
          map.push(at);
        }
        pendingSpace = false;
        for (const c of folded) {
          out.push(c);
          map.push(at);
        }
      } else {
        pendingSpace = true;
      }
    }
  }
  return { text: out.join(''), map };
}

export const normalizeSearch = (input: string): string => normalizeWithMap(input).text;

export const tokenize = (normalized: string): string[] => normalized.split(' ').filter(Boolean);

/** Maximum edits allowed for a word of this length. Short words get none: a 2- or 3-letter medical term is too ambiguous. */
export function maxEdits(length: number): number {
  if (length < 4) return 0;
  if (length < 8) return 1;
  return 2;
}

/**
 * Optimal-string-alignment distance: insertions, deletions, substitutions and adjacent transpositions each cost 1.
 * Stops early and returns max + 1 once the distance cannot be within `max`, so the work stays small.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const al = a.length;
  const bl = b.length;
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: bl + 1 }, (_, j) => j);
  for (let i = 1; i <= al; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[bl] <= max ? prev[bl] : max + 1;
}

/** Strips control characters, trims, and bounds the length of a raw query. */
export function cleanQuery(raw: unknown, max = 100): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
