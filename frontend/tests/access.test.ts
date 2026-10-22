import { describe, expect, it } from 'vitest';
import { authErrorText } from '../src/pages/AccessForms.js';
import { translations } from '../src/i18n/translations.js';

const AR = translations.ar.auth;
const EN = translations.en.auth;
const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

describe('account screens speak the page language', () => {
  const codes: Array<[string, number, string | undefined]> = [
    ['AUTH_FAILED', 401, undefined],
    ['INVALID_CREDENTIALS', 400, undefined],
    ['EMAIL_NOT_VERIFIED', 403, undefined],
    ['ACCOUNT_SUSPENDED', 403, undefined],
    ['PATIENT_ONLY_MODE', 403, undefined],
    ['WEAK_PASSWORD', 400, 'password'],
    ['VALIDATION_ERROR', 400, 'email'],
    ['VALIDATION_ERROR', 400, 'fullName'],
    ['EMAIL_NOT_CONFIGURED', 503, undefined],
    ['EMAIL_SEND_FAILED', 502, undefined],
    ['RATE_LIMITED', 429, undefined],
    ['SOMETHING_NEW', 500, undefined],
  ];

  it.each(codes)('%s (%i, %s) has Arabic and English wording, never the server English', (code, status, field) => {
    const ar = authErrorText(AR, { status, code, field });
    const en = authErrorText(EN, { status, code, field });
    expect(hasArabic(ar)).toBe(true);
    expect(hasArabic(en)).toBe(false);
    expect(ar).not.toBe(en);
  });

  it('tells a network failure apart', () => {
    expect(authErrorText(EN, { status: 0, code: 'NETWORK' })).toBe(EN.networkError);
    expect(authErrorText(AR, { status: 0, code: 'NETWORK' })).toBe(AR.networkError);
  });

  it('has the same screen strings in both languages, with the {email} slot kept', () => {
    expect(Object.keys(AR.errors).sort()).toEqual(Object.keys(EN.errors).sort());
    for (const key of ['inboxRegister', 'inboxForgot'] as const) {
      expect(AR[key]).toContain('{email}');
      expect(EN[key]).toContain('{email}');
    }
    for (const key of Object.keys(AR) as Array<keyof typeof AR>) {
      if (key === 'errors') continue;
      expect(typeof EN[key], String(key)).toBe('string');
    }
  });

  it('no longer tells people to contact an administrator to reset a password', () => {
    expect(JSON.stringify(translations.en.auth)).not.toMatch(/contact your medical center/i);
    expect(JSON.stringify(translations.ar.auth)).not.toContain('مسؤول مركزك');
  });
});
