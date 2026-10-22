import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Language } from '../../i18n/translations.js';
import { useAuth } from '../../context/AuthContext.js';
import { Translator, type Entry, type Fetcher, type Item } from './translator.js';

const TranslationContext = createContext<Translator | null>(null);

/** Gives every UserText below it one shared translator. `fetcher` is where translations come from. */
export const TranslationProvider: React.FC<{ fetcher?: Fetcher; translator?: Translator; children: React.ReactNode }> = ({ fetcher, translator, children }) => {
  const t = useMemo(() => translator ?? new Translator(fetcher ?? (async () => null)), [translator, fetcher]);
  return <TranslationContext.Provider value={t}>{children}</TranslationContext.Provider>;
};

/** Posts a batch and reads the `items` array back, or null when the request itself failed. */
async function post(url: string, body: unknown, headers: Record<string, string>, extra: RequestInit = {}): Promise<Item[] | null> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body: JSON.stringify(body), cache: 'no-store', ...extra });
  const json = await res.json().catch(() => null);
  return res.ok && json?.success ? (json.data.items as Item[]) : null;
}

/** The signed-in patient's translations: the server endpoint, with their own token. */
export const PatientTranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const fetcher = useMemo<Fetcher>(() => (texts, target) => post('/api/translations', { texts, target }, token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  return <TranslationProvider fetcher={fetcher}>{children}</TranslationProvider>;
};

/** The clinician's translations for one share: only wording inside that share is accepted by the server. */
export const ShareTranslationProvider: React.FC<{ token: string | null; children: React.ReactNode }> = ({ token, children }) => {
  const fetcher = useMemo<Fetcher>(() => async (texts, target) => (token ? post('/api/share-view/translate', { token, texts, target }, {}, { referrerPolicy: 'no-referrer' }) : null), [token]);
  return <TranslationProvider fetcher={fetcher}>{children}</TranslationProvider>;
};

/** The answer for one text in the target language, or undefined when no translation is wanted (`enabled` false). */
export function useTranslation(text: string, target: Language, enabled: boolean): Entry | undefined {
  const translator = useContext(TranslationContext);
  useSyncExternalStore(
    translator ? translator.subscribe : () => () => undefined,
    translator ? translator.getVersion : () => 0,
    translator ? translator.getVersion : () => 0,
  );
  useEffect(() => {
    if (translator && enabled) translator.request(text, target);
  }, [translator, text, target, enabled]);
  if (!enabled) return undefined;
  if (!translator) return { state: 'unavailable', reason: 'no_provider' };
  return translator.peek(text, target) ?? { state: 'loading' };
}
