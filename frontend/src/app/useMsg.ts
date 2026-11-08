import { useCallback, useState } from 'react';
import { useLang } from '../context/LangContext.js';
import { useA } from './useA.js';
import type { translations } from '../i18n/translations.js';

/**
 * A message that is worded when it is shown, not when it was produced.
 *
 * Screens keep their last error, confirmation or notice in state. If that state holds the finished sentence, switching the
 * site language leaves the old-language sentence on screen until the same thing happens again. So state holds a `Msg`:
 * plain text that must stay exactly as written (a name, a file name), or a function of the current strings that is called at
 * render time, so the sentence follows the language the moment it changes.
 *
 *   setError((A) => A.health.common.failed)        // stored as a recipe
 *   {error && <p>{say(error)}</p>}                  // worded in today's language
 */
export type AppStrings = ReturnType<typeof useA>;
export type SiteStrings = (typeof translations)['ar'];
export type Msg<S = AppStrings> = string | ((s: S) => string);

/** Words a stored message in the signed-in app's current language. */
export function useMsg() {
  const A = useA();
  return useCallback((m: Msg | null | undefined): string => (m == null ? '' : typeof m === 'function' ? m(A) : m), [A]);
}

/** Words a stored message on the public pages (sign-in, account forms), which use the site dictionary. */
export function useSiteMsg() {
  const { t } = useLang();
  return useCallback((m: Msg<SiteStrings> | null | undefined): string => (m == null ? '' : typeof m === 'function' ? m(t) : m), [t]);
}

/**
 * State for one message. `set` takes plain text or a recipe; the value you read is already worded in the current language.
 * (A recipe is a function, which `useState` would run as an updater, so the setter here wraps it first.)
 */
export function useMsgState(initial: Msg = ''): [string, (m: Msg | null) => void] {
  const say = useMsg();
  const [stored, setStored] = useState<{ m: Msg | null }>({ m: initial });
  const set = useCallback((m: Msg | null) => setStored({ m }), []);
  return [say(stored.m), set];
}

/** The same for the public pages, which word things from the site dictionary. */
export function useSiteMsgState(initial: Msg<SiteStrings> = ''): [string, (m: Msg<SiteStrings> | null) => void] {
  const say = useSiteMsg();
  const [stored, setStored] = useState<{ m: Msg<SiteStrings> | null }>({ m: initial });
  const set = useCallback((m: Msg<SiteStrings> | null) => setStored({ m }), []);
  return [say(stored.m), set];
}
