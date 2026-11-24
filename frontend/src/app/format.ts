import type { Language } from '../i18n/translations.js';

export const localeOf = (lang: Language) => (lang === 'ar' ? 'ar-EG' : 'en-GB');

type Named = { name_ar?: string | null; name_en?: string | null; full_name_ar?: string | null; full_name_en?: string | null } | null | undefined;

/** The name in the page language, falling back to the other one rather than showing nothing. */
export function nameOf(lang: Language, n: Named): string {
  if (!n) return '';
  const ar = n.name_ar ?? n.full_name_ar ?? '';
  const en = n.name_en ?? n.full_name_en ?? '';
  return (lang === 'ar' ? ar || en : en || ar) || '';
}

/** Server-named columns come as `<prefix>_ar` / `<prefix>_en`. */
export function pick(lang: Language, row: Record<string, any> | null | undefined, prefix: string): string {
  if (!row) return '';
  const ar = row[`${prefix}_ar`] ?? '';
  const en = row[`${prefix}_en`] ?? '';
  return (lang === 'ar' ? ar || en : en || ar) || '';
}

export function formatDate(lang: Language, value: string | Date | null | undefined, withTime = false): string {
  if (!value) return '';
  const raw = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  // A calendar day sent as midnight UTC (e.g. a document's date) is shown as that same day in any time zone.
  const dayOnly = !withTime && typeof raw === 'string' && /T00:00:00(\.000)?Z$/.test(raw);
  return new Intl.DateTimeFormat(
    localeOf(lang),
    withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium', ...(dayOnly ? { timeZone: 'UTC' } : {}) },
  ).format(d);
}

export const formatTime = (value: string | null | undefined) => (value ? value.slice(0, 5) : '');

export function formatBytes(n: number, lang: 'ar' | 'en' = 'en'): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  const u = lang === 'ar' ? { b: 'بايت', kb: 'ك.ب', mb: 'م.ب' } : { b: 'B', kb: 'KB', mb: 'MB' };
  if (n < 1024) return `${n} ${u.b}`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ${u.kb}`;
  return `${(n / 1024 / 1024).toFixed(1)} ${u.mb}`;
}

export const todayIso = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** A number in the digits of the language: Arabic-Indic in the Arabic UI, Western in English. No grouping. */
export const formatNum = (lang: Language, n: number) => new Intl.NumberFormat(localeOf(lang), { useGrouping: false, maximumFractionDigits: 2 }).format(n);

/** Digits only (ASCII 0-9) swapped for the language's own; everything else in the string is kept as written. */
export const localDigits = (lang: Language, s: string) => (lang === 'ar' ? s.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]) : s);

/** The page language as the document carries it (LangContext keeps <html lang> in step with the switch). */
const pageLang = (): Language => (typeof document !== 'undefined' && document.documentElement.lang === 'ar' ? 'ar' : 'en');

/** Fills {n}-style placeholders. A numeric value is written in the page language's digits. */
export const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = values[k];
    return typeof v === 'number' ? formatNum(pageLang(), v) : String(v ?? '');
  });
