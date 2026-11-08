import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ApiFailure } from '../src/app/api.js';
import { failureMsg } from '../src/app/errors.js';
import { SnapshotView, type Snapshot } from '../src/app/health/SnapshotView.js';
import { originOfLabel, sourceText } from '../src/app/health/sourceLabel.js';
import { appT } from '../src/app/i18n/index.js';
import { authErrorMsg, authErrorText } from '../src/pages/AccessForms.js';
import { LangProvider } from '../src/context/LangContext.js';
import { translations } from '../src/i18n/translations.js';

/** The strings a screen would get from useA() in each language. */
const strings = (lang: 'ar' | 'en') => ({ ...appT[lang], lang, isRtl: lang === 'ar' });

const fail = (status: number, code = 'X', details?: Record<string, unknown>): ApiFailure => ({ status, code, message: '', details }) as ApiFailure;

describe('a stored message is worded when it is shown, not when it happened', () => {
  it('offline and failure messages follow the language they are read in', () => {
    const offline = failureMsg(fail(0));
    expect(offline(strings('ar'))).toBe(appT.ar.health.common.offline);
    expect(offline(strings('en'))).toBe(appT.en.health.common.offline);
    expect(offline(strings('ar'))).not.toBe(offline(strings('en')));

    const generic = failureMsg(fail(500));
    expect(generic(strings('ar'))).toBe(appT.ar.health.common.failed);
    expect(generic(strings('en'))).toBe(appT.en.health.common.failed);
  });

  it('a validation error is worded from the active dictionary', () => {
    const e = fail(400, 'VALIDATION_ERROR', { rule: 'required', field: 'title' });
    const msg = failureMsg(e);
    const ar = msg(strings('ar'));
    const en = msg(strings('en'));
    expect(ar).toMatch(/[؀-ۿ]/);
    expect(en).not.toMatch(/[؀-ۿ]/);
  });

  it('a sign-in error is re-worded from the site dictionary', () => {
    const r = { status: 401, code: 'INVALID_CREDENTIALS' as const };
    const msg = authErrorMsg(r);
    expect(typeof msg).toBe('function');
    const fn = msg as (t: typeof translations.ar) => string;
    expect(fn(translations.ar)).toBe(authErrorText(translations.ar.auth, r));
    expect(fn(translations.en)).toBe(authErrorText(translations.en.auth, r));
    expect(fn(translations.ar)).not.toBe(fn(translations.en));
  });
});

describe('summary source sentences', () => {
  const origins = Object.keys(appT.ar.health.common.source) as Array<keyof typeof appT.ar.health.common.source>;

  it('every stored sentence maps back to its origin and is shown in the reader language', () => {
    for (const o of origins) {
      for (const stored of [appT.ar.health.common.source[o], appT.en.health.common.source[o]]) {
        expect(originOfLabel(stored)).toBe(o);
        expect(sourceText('ar', stored)).toBe(appT.ar.health.common.source[o]);
        expect(sourceText('en', stored)).toBe(appT.en.health.common.source[o]);
      }
    }
  });

  it('the sentences the server writes into drafts are recognised too', () => {
    expect(sourceText('en', 'أدخلتُه بنفسي')).toBe(appT.en.health.common.source.patient);
    expect(sourceText('ar', 'Entered by me')).toBe(appT.ar.health.common.source.patient);
    expect(sourceText('en', 'سجّله طبيب')).toBe(appT.en.health.common.source.clinician);
  });

  it('a label that is not one of ours is shown exactly as stored', () => {
    expect(sourceText('en', 'Dr. Salma — clinic note')).toBe('Dr. Salma — clinic note');
  });
});

describe('the clinician summary follows the reader language, not the language it was approved in', () => {
  const snapshot: Snapshot = {
    lang: 'ar',
    patient: { name: 'Mohammed', dateOfBirth: '1990-04-02' },
    visitDate: null,
    reason: 'صداع متكرر',
    overview: '',
    sections: [{ key: 'medications', items: [{ text: 'باراسيتامول 500 ملغ', date: null, source: appT.ar.health.common.source.patient }] }],
    documents: [],
  };
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
  // UserText reads the site language from context; the summary's own chrome is driven by the prop under test.
  const html = (lang?: 'ar' | 'en') => renderToStaticMarkup(React.createElement(LangProvider, null, React.createElement(SnapshotView, { snapshot, lang })));

  it('uses the approved language by default', () => {
    const out = html();
    expect(out).toContain('dir="rtl"');
    expect(out).toContain(appT.ar.health.shareView.sourceLabel);
    expect(out).toContain(appT.ar.health.common.source.patient);
  });

  it('switches the headings, labels and source sentences to English and flips direction', () => {
    const out = html('en');
    expect(out).toContain('dir="ltr"');
    expect(out).toContain('lang="en"');
    expect(out).toContain(appT.en.health.shareView.sourceLabel);
    expect(out).toContain(appT.en.health.common.source.patient);
    expect(out).not.toContain(appT.ar.health.common.source.patient);
    expect(out).toContain(appT.en.health.shareView.disclaimer);
  });

  it("leaves the patient's own words exactly as written", () => {
    expect(html('en')).toContain('باراسيتامول 500 ملغ');
    expect(html('en')).toContain('صداع متكرر');
  });
});

describe('both dictionaries are complete', () => {
  const count = (n: unknown): number => (typeof n === 'string' ? 1 : n && typeof n === 'object' ? Object.values(n).reduce<number>((a, v) => a + count(v), 0) : 0);

  it('the same number of entries exist in Arabic and English', () => {
    expect(count(appT.ar)).toBe(count(appT.en));
    expect(count(translations.ar)).toBe(count(translations.en));
  });

  it('are large enough that the language checks are really looking at something', () => {
    expect(count(appT.ar)).toBeGreaterThan(1000);
    expect(count(translations.ar)).toBeGreaterThan(150);
  });
});
