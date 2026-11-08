import { normalizeWithMap, tokenize } from './normalize.js';

export interface Range {
  start: number;
  end: number;
}

/**
 * Where the query's words appear in `text`, as ranges in the ORIGINAL string. Matching is done on the normalized forms (so
 * "ضغط" lights up inside "ضَغْط" and "ابره" inside "إبرة"), then mapped back through the character map, so the text itself is
 * never changed. Only plain ranges are returned; the caller renders them as React nodes, never as HTML.
 */
export function highlightRanges(text: string, query: string): Range[] {
  if (!text || !query) return [];
  const words = tokenize(normalizeWithMap(query).text).filter((w) => w.length >= 1);
  if (!words.length) return [];
  const n = normalizeWithMap(text);
  const out: Range[] = [];
  for (const w of words) {
    let from = 0;
    for (;;) {
      const at = n.text.indexOf(w, from);
      if (at < 0) break;
      // Only the start of a word counts for one or two letters, so "ab" does not light up the middle of every word.
      const atWordStart = at === 0 || n.text[at - 1] === ' ';
      if (w.length >= 3 || atWordStart) {
        const start = n.map[at];
        let end = n.map[at + w.length - 1] + 1;
        while (end < text.length && /[\p{M}ـ]/u.test(text[end])) end += 1; // keep marks with their letter
        out.push({ start, end });
      }
      from = at + w.length;
    }
  }
  return mergeRanges(out);
}

export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** Splits text into plain / highlighted pieces for rendering. */
export function splitByRanges(text: string, ranges: Range[]): Array<{ text: string; hit: boolean }> {
  const parts: Array<{ text: string; hit: boolean }> = [];
  let at = 0;
  for (const r of ranges) {
    if (r.start > at) parts.push({ text: text.slice(at, r.start), hit: false });
    parts.push({ text: text.slice(r.start, r.end), hit: true });
    at = r.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return parts;
}
