import { describe, it, expect } from 'vitest';
import { arabicToLatin, completeName, latinToArabic } from '../src/services/names/transliterate.js';

describe('name transliteration', () => {
  it('writes common Arabic names with their usual English spelling', () => {
    expect(arabicToLatin('هاني يسري محمود')).toBe('Hani Yousry Mahmoud');
    expect(arabicToLatin('محمد عبد الرحمن')).toBe('Mohamed Abdelrahman');
    expect(arabicToLatin('عبدالله المنصور')).toBe('Abdullah Al-Mansoor');
    expect(arabicToLatin('فَاطِمَة')).toBe('Fatma'); // diacritics are ignored
    expect(arabicToLatin('منة الله')).toBe('Menna Allah');
  });

  it('spells unknown Arabic names letter by letter, readably', () => {
    const out = arabicToLatin('سعدون');
    expect(out).toMatch(/^[A-Z][a-z]+$/);
    expect(out.toLowerCase()).toContain('s');
  });

  it('writes common English spellings back in Arabic, whatever the variant', () => {
    expect(latinToArabic('Hani Yousry Mahmoud')).toBe('هاني يسري محمود');
    expect(latinToArabic('Mohammed Yousri')).toBe('محمد يسري');
    expect(latinToArabic('Abdel Rahman Ali')).toBe('عبدالرحمن علي');
    expect(latinToArabic('Sarah El-Sherif')).toBe('سارة الشريف');
  });

  it('spells unknown Latin names in Arabic letters', () => {
    const out = latinToArabic('Peter');
    expect(out).toMatch(/^[؀-ۿ]+$/);
  });

  it('fills the missing side and keeps a side the person typed', () => {
    expect(completeName({ ar: 'هاني يسري محمود' })).toEqual({ ar: 'هاني يسري محمود', en: 'Hani Yousry Mahmoud' });
    expect(completeName({ en: 'Hani Yousry' })).toEqual({ ar: 'هاني يسري', en: 'Hani Yousry' });
    expect(completeName({ ar: 'هاني', en: 'Hany' })).toEqual({ ar: 'هاني', en: 'Hany' });
  });

  it('rewrites a side typed in the wrong script', () => {
    // How sign-up used to store a name: the same Arabic text in both columns.
    expect(completeName({ ar: 'هاني يسري محمود', en: 'هاني يسري محمود' })).toEqual({ ar: 'هاني يسري محمود', en: 'Hani Yousry Mahmoud' });
    expect(completeName({ ar: 'Hani', en: 'Hani' })).toEqual({ ar: 'هاني', en: 'Hani' });
  });
});
