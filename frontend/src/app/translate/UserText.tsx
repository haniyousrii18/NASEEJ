import React, { useState } from 'react';
import type { Language } from '../../i18n/translations.js';
import { useLang } from '../../context/LangContext.js';
import { appT } from '../i18n/index.js';
import { useTranslation } from './TranslationContext.js';

interface Props {
  /** What the person wrote. Always kept exactly as stored. */
  text: string | null | undefined;
  /** The page language. Defaults to the signed-in app's language; the clinician's share page passes its own. */
  lang?: Language;
  className?: string;
  /** Show only the translation (and its label). For under an input that already shows the original. */
  hint?: boolean;
  /** Start with the original visible next to the translation (e.g. for a printed copy). */
  showOriginalFirst?: boolean;
}

/**
 * Text a person typed, shown in the language of the page. The server says whether it needs translating:
 *  - same language, or no language (numbers, units): shown as written.
 *  - translated: the translation is shown, labelled with where it came from, and "Show original" reveals what was written.
 *  - not translatable (no provider configured, mixed languages, uncertain): the original is shown with a note saying why.
 * The original is never replaced, trimmed or discarded.
 */
export const UserText: React.FC<Props> = ({ text, lang, className, hint, showOriginalFirst }) => {
  const app = useLang().lang;
  const ui = lang ?? app;
  const value = text ?? '';
  const entry = useTranslation(value, ui, /\p{L}/u.test(value));
  const [showOriginal, setShowOriginal] = useState(!!showOriginalFirst);
  if (!value) return null;

  const U = appT[ui].common.userText;
  const uiDir = ui === 'ar' ? 'rtl' : 'ltr';
  const plain = (
    <span dir="auto" className={className}>
      {value}
    </span>
  );

  if (!entry || entry.state === 'loading' || entry.state === 'same') return hint ? null : plain;

  if (entry.state === 'unavailable') {
    return (
      <span className={`na-ut${className ? ` ${className}` : ''}`} data-state="unavailable">
        {!hint && (
          <span className="na-ut-orig" dir="auto">
            {value}
          </span>
        )}
        <span className="na-ut-note" dir={uiDir} lang={ui}>
          {(U.reasons as Record<string, string>)[entry.reason] ?? U.reasons.failed}
        </span>
      </span>
    );
  }

  const automatic = !!entry.provider && entry.provider !== 'glossary';
  return (
    <span className={`na-ut${className ? ` ${className}` : ''}`} data-state="ok">
      <span className="na-ut-tr" dir={uiDir} lang={ui}>
        {entry.text}
      </span>
      <span className="na-ut-meta" dir={uiDir} lang={ui}>
        {automatic && <span className="na-ut-auto">{U.automatic}</span>}
        {!hint && (
          <button type="button" className="na-ut-toggle" aria-expanded={showOriginal} onClick={() => setShowOriginal((v) => !v)}>
            {showOriginal ? U.hideOriginal : U.showOriginal}
          </button>
        )}
      </span>
      {!hint && showOriginal && (
        <span className="na-ut-orig" dir="auto" lang={entry.from}>
          <span className="na-ut-label" dir={uiDir} lang={ui}>
            {U.original}
          </span>{' '}
          {value}
        </span>
      )}
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
