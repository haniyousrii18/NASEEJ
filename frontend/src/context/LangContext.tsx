import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Language, translations } from '../i18n/translations.js';

interface LangContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: typeof translations['ar'];
  isRtl: boolean;
}

/** Arabic reads right-to-left, English left-to-right. The one place that decides it. */
export const directionOf = (lang: Language): 'rtl' | 'ltr' => (lang === 'ar' ? 'rtl' : 'ltr');

const LangContext = createContext<LangContextType | undefined>(undefined);

export const LangProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    return (localStorage.getItem('naseej_lang') as Language) || 'ar';
  });

  /**
   * Changing language re-words and re-flows the whole page (and flips its direction). Done in one synchronous commit inside a
   * view transition, the browser crossfades the old page into the new one instead of showing a half-updated frame.
   * Without View Transitions, or with reduced motion, it is the plain state change.
   */
  const setLang = useCallback((next: Language) => {
    const html = document.documentElement;
    const apply = () => {
      flushSync(() => setLangState(next));
      html.lang = next;
      html.dir = directionOf(next);
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (doc.startViewTransition && !calm) doc.startViewTransition(apply);
    else setLangState(next);
  }, []);

  useEffect(() => {
    localStorage.setItem('naseej_lang', lang);
    const html = document.documentElement;
    html.lang = lang;
    html.dir = directionOf(lang);
    // The tab title and the description search engines and link previews read follow the language too. A title a signed-in
    // page has set for itself (the page name) is left alone: only the site's own default is replaced.
    const own = [translations.ar, translations.en].map((x) => `${x.brand.name} | ${x.brand.tagline}`);
    if (!document.title || own.includes(document.title) || document.title === 'Naseej | نَسيج — Connected Healthcare Platform') {
      document.title = `${translations[lang].brand.name} | ${translations[lang].brand.tagline}`;
    }
    document.querySelector('meta[name="description"]')?.setAttribute('content', translations[lang].brand.subtitle);
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t: translations[lang], isRtl: directionOf(lang) === 'rtl' }), [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
};

export const useLang = () => {
  const context = useContext(LangContext);
  if (!context) throw new Error('useLang must be used within a LangProvider');
  return context;
};
