import { useLang } from '../context/LangContext.js';
import { appT } from './i18n/index.js';

/** The authenticated app's strings for the current language: A.common, A.nav, A.patient, A.doctor, ... */
export function useA() {
  const { lang, isRtl } = useLang();
  return { ...appT[lang], lang, isRtl };
}
