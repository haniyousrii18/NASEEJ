import React from 'react';
import type { Language } from '../../i18n/translations.js';
import { useLang } from '../../context/LangContext.js';
import { appT } from '../i18n/index.js';
import { useTranslation, useTranslator } from './TranslationContext.js';
import { dirOf, needsTranslation } from './script.js';

interface Props {
  /** What the person wrote. Always shown exactly as stored. */
  text: string | null | undefined;
  /** The page language. Defaults to the signed-in app's language; the clinician's share page passes its own. */
  lang?: Language;
  className?: string;
  /** Show only the translation (or its note). For under an input that already shows the original. */
  hint?: boolean;
}

/**
 * Text a person typed. If it is written in the other language than the page, the original stays on screen and a clearly
 * labelled translation sits under it. If no translation can be given, the original stays and a short note says so.
 * It never replaces, trims or rewrites the stored wording.
 */
export const UserText: React.FC<Props> = ({ text, lang, className, hint }) => {
  const app = useLang().lang;
  const ui = lang ?? app;
  const value = text ?? '';
  const wanted = value.length > 0 && needsTranslation(value, ui);
  const entry = useTranslation(value, ui, wanted);
  const translator = useTranslator();
  if (!value) return null;
  if (!wanted) {
    if (hint) return null;
    return (
      <span dir="auto" className={className}>
        {value}
      </span>
    );
  }
  const U = appT[ui].common.userText;
  const uiDir = ui === 'ar' ? 'rtl' : 'ltr';
  return (
    <span className={`na-ut${className ? ` ${className}` : ''}`} data-state={entry?.state}>
      {!hint && (
        <span className="na-ut-orig" dir={dirOf(value)} lang={ui === 'en' ? 'ar' : 'en'}>
          {value}
        </span>
      )}
      {entry?.state === 'ok' && (
        <span className="na-ut-tr" dir={uiDir} lang={ui}>
          <span className="na-ut-tag" title={entry.source === 'glossary' ? U.glossary : U.machine}>
            {U.translation}
          </span>{' '}
          {entry.text}
        </span>
      )}
      {entry?.state === 'loading' && (
        <span className="na-ut-note" role="status" dir={uiDir} lang={ui}>
          {U.translating}
        </span>
      )}
      {entry?.state === 'unavailable' && (
        <span className="na-ut-note" dir={uiDir} lang={ui}>
          {(U.reasons as Record<string, string>)[entry.reason] ?? U.unavailable}
          {entry.reason === 'consent' && translator?.enable && (
            <>
              {' '}
              <button type="button" className="na-ut-action" onClick={() => void translator.turnOn()}>
                {U.turnOn}
              </button>
            </>
          )}
        </span>
      )}
    </span>
  );
};
