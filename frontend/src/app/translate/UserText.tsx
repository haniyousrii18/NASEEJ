import React from 'react';
import type { Language } from '../../i18n/translations.js';
import { useLang } from '../../context/LangContext.js';
import { useTranslation } from './TranslationContext.js';

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
export const UserText: React.FC<Props> = ({ text, lang, className, hint }) => {
  const app = useLang().lang;
  const ui = lang ?? app;
  const value = text ?? '';
  const entry = useTranslation(value, ui, /\p{L}/u.test(value));
  if (!value) return null;

  const uiDir = ui === 'ar' ? 'rtl' : 'ltr';
  const plain = (
    <span dir="auto" className={className}>
      {value}
    </span>
  );

  if (!entry || entry.state === 'loading' || entry.state === 'same') return hint ? null : plain;

  // Not translatable (no provider, mixed or uncertain language): the text is shown as written, with no notice or label.
  if (entry.state === 'unavailable') return hint ? null : plain;

  return (
    <span className={className} dir={uiDir} lang={ui}>
      {entry.text}
    </span>
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
