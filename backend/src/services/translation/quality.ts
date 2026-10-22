/**
 * Quality gate for machine translation. A neural translator can sound fluent and still change the meaning ("زيارة متابعة
 * القلب" -> "Heart check."), so its output is accepted only if translating it BACK recovers most of the content words of the
 * original. A faithful translation round-trips; a dropped or invented concept does not. Failing the gate means "no reliable
 * translation": the original is shown, never a guess.
 */
import { nz } from './glossary/engine.js';
import type { Lang } from './provider.js';

const AR_STOP = new Set(['في', 'من', 'على', 'الى', 'عن', 'مع', 'و', 'ان', 'ما', 'هذا', 'هذه', 'ذلك', 'عند', 'قد', 'لقد', 'كان', 'انا', 'منذ', 'لمده', 'خلال']);
const EN_STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'been', 'for', 'with', 'when', 'after', 'since', 'i', 'my', 'it', 'that', 'this', 'has', 'have', 'had', 'ago', 'about']);

function stemEn(w: string): string {
  return w.replace(/(ing|ed|es|s)$/, '');
}

/** Content words of a text: lower-cased, stop words and one-letter tokens removed, light stemming. */
export function contentTokens(text: string, lang: Lang): string[] {
  if (lang === 'ar') {
    return (nz(text).match(/[ء-ي]+/g) ?? [])
      .map((w) => (w.startsWith('ال') && w.length > 3 ? w.slice(2) : w))
      .filter((w) => w.length > 1 && !AR_STOP.has(w));
  }
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length > 1 && !EN_STOP.has(w)).map(stemEn);
}

const same = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));

/** Share of the original's content words found (as equal or prefix-related words) in the back-translation. */
export function recall(original: string, back: string, lang: Lang): number {
  const src = contentTokens(original, lang);
  if (src.length === 0) return 1;
  const got = contentTokens(back, lang);
  return src.filter((w) => got.some((g) => same(w, g))).length / src.length;
}

export const MIN_RECALL = 0.85;

/** Cheap checks on the output itself: not empty, not absurdly long or short, no stray scripts or bracket artefacts. */
export function plausible(original: string, out: string, target: Lang): boolean {
  const o = out.trim();
  if (!o) return false;
  const ratio = o.length / original.trim().length;
  if (ratio > 4 || ratio < 0.25) return false;
  if (/[()\[\]{}<>]/.test(o) && !/[()\[\]{}<>]/.test(original)) return false;
  const arabic = (o.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (o.match(/[A-Za-z]/g) ?? []).length;
  if (target === 'ar' && latin > arabic * 0.5 && !/[A-Za-z]/.test(original)) return false;
  if (target === 'en' && arabic > 0) return false; // Arabic left in the English output means part of it was not translated
  // the same word repeated over and over is a classic failure of sequence models
  const words = o.toLowerCase().split(/\s+/);
  if (words.length >= 6 && new Set(words).size / words.length < 0.4) return false;
  return true;
}
