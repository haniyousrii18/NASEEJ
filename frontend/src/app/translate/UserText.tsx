import React from 'react';
import type { Language } from '../../i18n/translations.js';
import { useLang } from '../../context/LangContext.js';
import { useTranslation } from './TranslationContext.js';
import { localDigits } from '../format.js';
import { appT } from '../i18n/index.js';

interface Props {
  /** What the person wrote. Always kept exactly as stored. */
  text: string | null | undefined;
  /** The page language. Defaults to the signed-in app's language; the clinician's share page passes its own. */
  lang?: Language;
  className?: string;
  /** Show only the translation (and its label). For under an input that already shows the original. */
  hint?: boolean;
}

/**
 * Text a person typed, shown in the language of the page. The server says whether it needs translating:
 *  - same language, or no language (numbers, units): shown as written.
 *  - translated: the translation is shown, labelled with where it came from.
 *  - not translatable (no provider configured, mixed languages, uncertain): the original is shown with a note saying why.
 * The original is never replaced, trimmed or discarded.
 */
/**
 * Separators the app and the server put between the parts of a composed line ("title — detail · detail (more)",
 * "better: …"). Each part is translated on its own, so one untranslatable or differently-written part (a name, a value
 * with a unit, a word in the other language) no longer leaves the whole line in its original language.
 */
const PARTS = /( — | · | \(|\)(?=\s|$)|: )/;

/**
 * Codes and abbreviations that older summaries stored as text (a document type such as "lab_report", "Rx"): shown with
 * their label in the page language. They are labels the app owns, not words the patient wrote.
 */
const codeLabel = (value: string, ui: Language): string | null => {
  const types = appT[ui].health.vault.types as Record<string, string>;
  const v = value.trim();
  if (/^[a-z]+(?:_[a-z]+)+$/.test(v) && types[v]) return types[v];
  if (/^rx\.?$/i.test(v)) return types.prescription;
  return null;
};

export const UserText: React.FC<Props> = ({ text, lang, className, hint }) => {
  const app = useLang().lang;
  const ui = lang ?? app;
  const code = text ? codeLabel(text, ui) : null;
  const value = code ?? text ?? '';
  const split = !hint && PARTS.test(value);
  const entry = useTranslation(value, ui, !split && /\p{L}/u.test(value));
  if (!value) return null;

  const uiDir = ui === 'ar' ? 'rtl' : 'ltr';
  if (split) {
    const pieces = value.split(PARTS);
    return (
      <span className={className} dir={uiDir}>
        {pieces.map((piece, i) =>
          i % 2 === 1 ? (
            <React.Fragment key={i}>{piece}</React.Fragment>
          ) : piece.trim() ? (
            <UserText key={i} text={piece} lang={ui} />
          ) : null,
        )}
      </span>
    );
  }
  // Same number, the page language's digit glyphs: Arabic-Indic in the Arabic UI. Nothing else about the text changes.
  const shown = (t: string) => localDigits(ui, t);
  const plain = (
    <span dir="auto" className={className}>
      {shown(value)}
    </span>
  );

  if (!entry || entry.state === 'loading' || entry.state === 'same') return hint ? null : plain;

  // Not translatable (no provider, mixed or uncertain language): the text is shown as written, with no notice or label.
  if (entry.state === 'unavailable') return hint ? null : plain;

  return (
    <span className={className} dir={uiDir} lang={ui}>
      {shown(entry.text)}
    </span>
  );
};

/** What a person typed, as a plain string in the page language (translated when possible): for aria-labels and titles. */
export function useUserTextString(text: string | null | undefined, lang?: Language): string {
  const app = useLang().lang;
  const ui = lang ?? app;
  const value = text ?? '';
  const entry = useTranslation(value, ui, /\p{L}/u.test(value));
  return entry && 'text' in entry && typeof entry.text === 'string' ? entry.text : value;
}

/**
 * Under a field that holds text as it was written (a frozen summary line, a draft written in the other language): the
 * same text in the page language. Renders nothing when the text is already in the page language.
 */
export const InPageLanguage: React.FC<{ text: string | null | undefined; className?: string }> = ({ text, className }) => {
  const ui = useLang().lang;
  const value = text ?? '';
  const other = ui === 'en' ? /[؀-ۿ]/.test(value) : /[A-Za-z]{2,}/.test(value);
  if (!other) return null;
  return (
    <p className={className ?? 'hp-in-lang'} lang={ui}>
      <UserText text={value} lang={ui} />
    </p>
  );
};

/** Marks where typed text goes in a sentence template, e.g. fill('{title} — {date}', { title: TEXT_SLOT, date }). */
export const TEXT_SLOT = '\u0001';

/**
 * A sentence with something the person typed inside it. The typed text is rendered by UserText (translated to the page language
 * and isolated for bidirectional text), so Arabic inside an English sentence cannot reorder the words and digits around it.
 */
export function withText(sentence: string, typed: string, lang?: Language): React.ReactNode {
  const [before, after = ''] = sentence.split(TEXT_SLOT);
  return (
    <>
      {before}
      <UserText text={typed} lang={lang} />
      {after}
    </>
  );
}
