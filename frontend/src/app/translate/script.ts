import type { Language } from '../../i18n/translations.js';

/**
 * Which language a piece of typed text is written in, judged by its letters. This only decides whether a translation is
 * worth asking for; it never rewrites anything. Digits, punctuation, emoji, symbols and measurements are ignored, so a
 * bare "5/10" or "500 mg" is neither language and is left alone.
 */
// Arabic letters only: the Arabic-Indic digits and separators (U+0660-066C, U+06F0-06F9) are numbers, not language.
const ARABIC = /[؀-ٟ٭-ۯۺ-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;
const LATIN = /[A-Za-zÀ-ɏ]/g;

/** A number with its unit ("500 mg", "120 mmHg") is a measurement, not a sentence in a language. */
const MEASURE = /[\d٠-٩.,]+\s?(?:mg|mcg|g|kg|ml|l|iu|mmhg|bpm|cm|mm|m|c|f)\b/gi;

export type Script = 'ar' | 'en' | 'mixed' | 'none';

export function scriptOf(text: string): Script {
  const words = text.replace(MEASURE, ' ');
  const ar = (words.match(ARABIC) ?? []).length;
  const en = (words.match(LATIN) ?? []).length;
  if (ar + en < 3) return 'none';
  const share = ar / (ar + en);
  if (share >= 0.7) return 'ar';
  if (share <= 0.3) return 'en';
  return 'mixed';
}

/**
 * True when the text is mainly in the other language than the interface. Mixed text such as "Panadol بعد الأكل" is left
 * as written: translating half a sentence would invite the kind of guess a medical note must not contain.
 */
export function needsTranslation(text: string, ui: Language): boolean {
  const s = scriptOf(text);
  return ui === 'en' ? s === 'ar' : s === 'en';
}

/** The text direction to give a piece of typed text so Arabic reads right-to-left inside an English page and vice versa. */
export const dirOf = (text: string): 'rtl' | 'ltr' => (scriptOf(text) === 'ar' ? 'rtl' : 'ltr');
