import { describe, expect, it } from 'vitest';
import { appT } from '../src/app/i18n/index.js';
import { translations } from '../src/i18n/translations.js';

const keys = (o: unknown, prefix = ''): string[] =>
  o && typeof o === 'object' ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix + k + '.')) : [prefix];

describe('Arabic and English ship together', () => {
  it('the signed-in app has the same strings in both languages', () => {
    expect(keys(appT.en).sort()).toEqual(keys(appT.ar).sort());
  });
  it('the public site has the same strings in both languages', () => {
    expect(keys(translations.en).sort()).toEqual(keys(translations.ar).sort());
  });
  it('the landing page makes no diagnosis, treatment or certification claim', () => {
    const text = JSON.stringify([translations.ar.landing, translations.ar.hero, translations.en.landing, translations.en.hero]);
    expect(text).not.toMatch(/certified|guarantee|يضمن|معتمد طبي/i);
  });
});
