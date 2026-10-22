import React, { createContext, useContext, useState, useEffect } from 'react';
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
  const [lang, setLang] = useState<Language>(() => {
    return (localStorage.getItem('naseej_lang') as Language) || 'ar';
  });

  useEffect(() => {
    localStorage.setItem('naseej_lang', lang);
    const html = document.documentElement;
    html.lang = lang;
    html.dir = directionOf(lang);
  }, [lang]);

  const value = {
    lang,
    setLang,
    t: translations[lang],
    isRtl: directionOf(lang) === 'rtl',
  };

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
};

export const useLang = () => {
  const context = useContext(LangContext);
  if (!context) throw new Error('useLang must be used within a LangProvider');
  return context;
};
