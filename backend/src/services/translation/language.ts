import type { Lang } from './provider.js';

/**
 * Which language typed text is written in, judged by its letters. Digits, punctuation, symbols and measurements such as
 * "500 mg" count for nothing, so a bare "5/10" has no language. This only decides whether a translation is worth asking
 * for; it never changes the text.
 */
// Arabic letters only: the Arabic-Indic digits and separators (U+0660-066C, U+06F0-06F9) are numbers, not language.
const ARABIC = /[؀-ٟ٭-ۯۺ-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;
const LATIN = /[A-Za-zÀ-ɏ]/g;
const MEASURE = /[\d٠-٩.,]+\s?(?:mg|mcg|g|kg|ml|l|iu|mmhg|bpm|cm|mm|m|c|f)\b/gi;

export type TextLang = Lang | 'mixed' | 'none';

export function detectLang(text: string): TextLang {
  const words = text.replace(MEASURE, ' ');
  const ar = (words.match(ARABIC) ?? []).length;
  const en = (words.match(LATIN) ?? []).length;
  if (ar + en < 3) return 'none';
  const share = ar / (ar + en);
  if (share >= 0.7) return 'ar';
  if (share <= 0.3) return 'en';
  return 'mixed';
}
