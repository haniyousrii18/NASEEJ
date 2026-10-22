import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiFailure } from '../src/app/api.js';
import { validationMessage } from '../src/app/errors.js';
import { SnapshotView, type Snapshot } from '../src/app/health/SnapshotView.js';
import { appT } from '../src/app/i18n/index.js';
import { TranslationProvider } from '../src/app/translate/TranslationContext.js';
import { TEXT_SLOT, UserText, withText } from '../src/app/translate/UserText.js';
import { Translator, type Item } from '../src/app/translate/translator.js';
import { LangProvider, directionOf, useLang } from '../src/context/LangContext.js';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
});

const AR = 'ألم في الصدر منذ يومين';
const EN = 'Chest pain for two days';

/** A translator whose server answers come from `map` (the text -> the server's answer for it). */
const translatorFor = (map: Record<string, Item>, spy = vi.fn()) => ({
  spy,
  t: new Translator(async (texts, target) => {
    spy(texts, target);
    return texts.map((x) => map[`${target}:${x}`] ?? { status: 'unavailable', reason: 'no_provider' });
  }),
});
const settle = (t: Translator, pairs: Array<[string, 'ar' | 'en']>) => {
  pairs.forEach(([text, target]) => t.request(text, target));
  return new Promise((r) => setTimeout(r, 5));
};
const render = (lang: 'ar' | 'en', t: Translator | null, node: React.ReactNode) => {
  store.set('naseej_lang', lang);
  return renderToStaticMarkup(React.createElement(LangProvider, null, t ? React.createElement(TranslationProvider, { translator: t }, node) : node));
};
const text = (props: Record<string, unknown>) => React.createElement(UserText, props as never);

describe('typed text in the page language', () => {
  it('English page, Arabic entry: the translation is shown, labelled, and the original is one click away', async () => {
    const { t } = translatorFor({ [`en:${AR}`]: { status: 'ok', text: 'Chest pain since two days', from: 'ar' } });
    await settle(t, [[AR, 'en']]);
    const html = render('en', t, text({ text: AR }));
    expect(html).toContain('Chest pain since two days');
    expect(html).not.toContain('Translated from');
    expect(html).toContain(appT.en.common.userText.showOriginal);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain(AR); // collapsed, but not discarded: see the next test
  });

  it('Arabic page, English entry: the Arabic translation is shown, labelled', async () => {
    const { t } = translatorFor({ [`ar:${EN}`]: { status: 'ok', text: 'ألم في الصدر منذ يومين', from: 'en' } });
    await settle(t, [[EN, 'ar']]);
    const html = render('ar', t, text({ text: EN }));
    expect(html).toContain(AR);
    expect(html).not.toContain('مترجم من');
    expect(html).toContain(appT.ar.common.userText.showOriginal);
  });

  it('labels a machine translation as automatic, but not a glossary one', async () => {
    const { t } = translatorFor({
      [`en:${AR}`]: { status: 'ok', text: 'Pain in the chest since 2 days ago', from: 'ar', provider: 'glossary' },
      'en:أشعر بدوار': { status: 'ok', text: 'I feel dizzy', from: 'ar', provider: 'local-mt' },
    });
    await settle(t, [[AR, 'en'], ['أشعر بدوار', 'en']]);
    expect(render('en', t, text({ text: AR }))).not.toContain(appT.en.common.userText.automatic);
    const mt = render('en', t, text({ text: 'أشعر بدوار' }));
    expect(mt).toContain('I feel dizzy');
    expect(mt).toContain(appT.en.common.userText.automatic);
    expect(render('ar', t, text({ text: 'أشعر بدوار' }))).not.toContain('I feel dizzy'); // Arabic page: the Arabic text is already in its language
  });

  it('keeps the original exactly as written and shows it next to the translation on request', async () => {
    const tricky = '  ألم <b>شديد</b> & "حاد" ٣٩  ';
    const { t } = translatorFor({ [`en:${tricky}`]: { status: 'ok', text: 'Severe pain 39', from: 'ar' } });
    await settle(t, [[tricky, 'en']]);
    const html = render('en', t, text({ text: tricky, showOriginalFirst: true }));
    expect(html).toContain('Severe pain 39');
    expect(html).toContain(appT.en.common.userText.original);
    expect(html).toContain(tricky.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
    expect(html).toContain(appT.en.common.userText.hideOriginal);
  });

  it('shows text already in the page language, and numbers, exactly as written with no translation chrome', async () => {
    const { t } = translatorFor({ [`en:${EN}`]: { status: 'same' }, 'en:5/10': { status: 'same' } });
    await settle(t, [[EN, 'en'], ['5/10', 'en']]);
    for (const value of [EN, '5/10']) {
      const html = render('en', t, text({ text: value }));
      expect(html).toContain(value);
      expect(html).not.toContain('na-ut');
    }
  });

  it('shows the original while the server is still answering, never a blank', () => {
    const t = new Translator(async () => new Promise(() => undefined));
    const html = render('en', t, text({ text: AR }));
    expect(html).toContain(AR);
    expect(html).not.toContain('na-ut');
  });

  it.each(['no_provider', 'mixed', 'uncertain', 'failed', 'not_allowed'] as const)('says plainly that no translation is available (%s), in both languages, and keeps the original', async (reason) => {
    const { t } = translatorFor({ [`en:${AR}`]: { status: 'unavailable', reason }, [`ar:${EN}`]: { status: 'unavailable', reason } });
    await settle(t, [[AR, 'en'], [EN, 'ar']]);
    const en = render('en', t, text({ text: AR }));
    expect(en).toContain(AR);
    expect(en).toContain(appT.en.common.userText.reasons[reason]);
    expect(en).toContain('data-state="unavailable"');
    const ar = render('ar', t, text({ text: EN }));
    expect(ar).toContain(EN);
    expect(ar).toContain(appT.ar.common.userText.reasons[reason]);
  });

  it('under an input (hint), shows only the translation and a label, never the original again', async () => {
    const { t } = translatorFor({ [`en:${AR}`]: { status: 'ok', text: 'Chest pain since two days', from: 'ar' } });
    await settle(t, [[AR, 'en']]);
    const html = render('en', t, text({ text: AR, hint: true }));
    expect(html).toContain('Chest pain since two days');
    expect(html).not.toContain(AR);
    expect(html).not.toContain('na-ut-toggle');
  });

  it('renders nothing for empty text', () => {
    expect(render('en', null, text({ text: '' }))).toBe('');
    expect(render('en', null, text({ text: null }))).toBe('');
  });
});

describe('typed text inside a sentence', () => {
  it('stays an isolated piece, so Arabic cannot reorder the date around it (the "22 — صداع Oct 2026" bug)', async () => {
    const { t } = translatorFor({ 'en:صداع': { status: 'ok', text: 'Headache', from: 'ar' } });
    await settle(t, [['صداع', 'en']]);
    const sentence = appT.en.health.home.visit.replace('{title}', TEXT_SLOT).replace('{date}', '22 Oct 2026');
    const html = render('en', t, React.createElement(React.Fragment, null, withText(sentence, 'صداع')));
    expect(html).toContain('Headache');
    expect(html).toContain('dir="ltr"'); // the translation is its own left-to-right run
    expect(html.indexOf('Headache')).toBeLessThan(html.indexOf('22 Oct 2026'));
    const plain = render('en', null, React.createElement(React.Fragment, null, withText(sentence, 'صداع')));
    expect(plain).toContain('<span class="na-ut-orig" dir="auto">صداع</span>'); // with no translation the original is still its own isolated run
  });
});

describe('switching language shows the other direction without re-entering anything', () => {
  it('asks for, and shows, the translation for whichever language the page is in', async () => {
    const { t, spy } = translatorFor({
      [`en:${AR}`]: { status: 'ok', text: 'Chest pain since two days', from: 'ar' },
      [`ar:${AR}`]: { status: 'same' },
    });
    await settle(t, [[AR, 'en']]);
    expect(render('en', t, text({ text: AR }))).toContain('Chest pain since two days');
    await settle(t, [[AR, 'ar']]); // the person switches to Arabic
    const ar = render('ar', t, text({ text: AR }));
    expect(ar).toContain(AR);
    expect(ar).not.toContain('na-ut');
    expect(spy.mock.calls.map((c) => c[1])).toEqual(['en', 'ar']);
    await settle(t, [[AR, 'en']]); // and back: answered from memory
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('the translator: existing and newly added content', () => {
  it('batches everything on screen into one request and remembers the answers', async () => {
    const { t, spy } = translatorFor({ [`en:${AR}`]: { status: 'ok', text: 'A', from: 'ar' }, 'en:صداع': { status: 'ok', text: 'Headache', from: 'ar' } });
    t.request(AR, 'en');
    t.request('صداع', 'en');
    t.request(AR, 'en');
    await new Promise((r) => setTimeout(r, 5));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual([AR, 'صداع']);
    expect(t.peek(AR, 'en')).toEqual({ state: 'ok', text: 'A', from: 'ar' });
  });
  it('translates a newly added entry on its own, leaving the earlier ones alone', async () => {
    const { t, spy } = translatorFor({ [`en:${AR}`]: { status: 'ok', text: 'A', from: 'ar' }, 'en:سعال جاف': { status: 'ok', text: 'Dry cough', from: 'ar' } });
    await settle(t, [[AR, 'en']]);
    await settle(t, [[AR, 'en'], ['سعال جاف', 'en']]);
    expect(spy.mock.calls[1][0]).toEqual(['سعال جاف']);
    expect(t.peek('سعال جاف', 'en')).toEqual({ state: 'ok', text: 'Dry cough', from: 'ar' });
  });
  it('treats a failed or throwing request as unavailable, never as a translation', async () => {
    const t = new Translator(async () => {
      throw new Error('down');
    });
    await settle(t, [[AR, 'en']]);
    expect(t.peek(AR, 'en')).toEqual({ state: 'unavailable', reason: 'failed' });
  });
});

describe('clinician view', () => {
  const snap = (lang: 'ar' | 'en'): Snapshot => ({
    lang,
    patient: null,
    visitDate: null,
    reason: lang === 'en' ? AR : EN,
    overview: '',
    sections: [{ key: 'symptoms', items: [{ text: lang === 'en' ? AR : EN, date: null, source: 'x' }] }],
    documents: [],
  });
  it('an English summary is left-to-right and shows Arabic entries in English', async () => {
    const { t } = translatorFor({ [`en:${AR}`]: { status: 'ok', text: 'Chest pain since two days', from: 'ar' } });
    await settle(t, [[AR, 'en']]);
    const html = render('ar', t, React.createElement(SnapshotView, { snapshot: snap('en') }));
    expect(html).toContain('<article class="hp-sv" dir="ltr" lang="en">');
    expect(html).toContain('Chest pain since two days');
  });
  it('an Arabic summary is right-to-left and shows English entries in Arabic', async () => {
    const { t } = translatorFor({ [`ar:${EN}`]: { status: 'ok', text: AR, from: 'en' } });
    await settle(t, [[EN, 'ar']]);
    const html = render('en', t, React.createElement(SnapshotView, { snapshot: snap('ar') }));
    expect(html).toContain('<article class="hp-sv" dir="rtl" lang="ar">');
    expect(html).toContain(AR);
  });
  it('keeps the original reachable and says so when there is no translation', async () => {
    const { t } = translatorFor({});
    await settle(t, [[AR, 'en']]);
    const html = render('ar', t, React.createElement(SnapshotView, { snapshot: snap('en') }));
    expect(html).toContain(AR);
    expect(html).toContain(appT.en.common.userText.reasons.no_provider);
  });
});

describe('language switching and direction', () => {
  const Probe: React.FC = () => {
    const { lang, isRtl, t } = useLang();
    return React.createElement('p', { 'data-lang': lang, 'data-rtl': String(isRtl) }, t.landing.skip);
  };
  it('maps each language to its direction in one place', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
  });
  it('gives Arabic right-to-left and English left-to-right, each with its own strings', () => {
    const ar = render('ar', null, React.createElement(Probe));
    const en = render('en', null, React.createElement(Probe));
    expect(ar).toContain('data-rtl="true"');
    expect(en).toContain('data-rtl="false"');
    expect(ar).not.toEqual(en);
  });
  it('has every new label in both languages', () => {
    for (const lang of ['ar', 'en'] as const) {
      const U = appT[lang].common.userText;
      expect(Object.values(U.reasons).every((r) => r.length > 0)).toBe(true);
      expect(U.showOriginal && U.hideOriginal && U.original && U.automatic).toBeTruthy();
    }
    expect(appT.ar.common.userText.showOriginal).not.toBe(appT.en.common.userText.showOriginal);
  });
  it('never remounts the interface on a language change, so unsaved input survives the switch', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx$/.test(e.name) ? [path.join(dir, e.name)] : []));
    const offenders = walk(path.resolve(__dirname, '../src')).filter((f) => /\bkey=\{[^}]*\b(lang|isRtl)\b[^}]*\}/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('server messages are shown in the page language', () => {
  const fail = (code: string, details: Record<string, unknown>): ApiFailure => ({ status: 400, code, message: 'English text from the server', details });
  it('words a validation rule in Arabic and English, with its parameters, never the server English', () => {
    const err = fail('VALIDATION_ERROR', { rule: 'textTooLong', field: 'notes', max: 2000 });
    expect(validationMessage(appT.en, err)).toBe('Notes is too long (up to 2000 characters).');
    expect(validationMessage(appT.ar, err)).toBe('الملاحظات طويل جداً (حتى 2000 حرفاً).');
    expect(validationMessage(appT.ar, err)).not.toContain('English');
  });
  it('words account and password errors by code', () => {
    expect(validationMessage(appT.ar, fail('WEAK_PASSWORD', { field: 'newPassword' }))).toBe(appT.ar.common.validation.account.WEAK_PASSWORD);
    expect(validationMessage(appT.en, fail('VALIDATION_ERROR', { field: 'phone' }))).toBe('Enter a valid phone number.');
  });
  it('falls back to a generic message in the page language for anything it does not know', () => {
    expect(validationMessage(appT.ar, fail('SOMETHING', {}))).toBe(appT.ar.common.validation.generic);
    expect(validationMessage(appT.en, fail('SOMETHING', {}))).toBe(appT.en.common.validation.generic);
  });
  it('has a message for every rule the server can send, in both languages', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../backend/src/services/health/input.ts'), 'utf8');
    const rules = [...src.matchAll(/rule: '(\w+)'/g)].map((m) => m[1]);
    expect(rules.length).toBeGreaterThan(10);
    for (const rule of new Set(rules)) {
      expect(appT.en.common.validation.rules[rule], rule).toBeTruthy();
      expect(appT.ar.common.validation.rules[rule], rule).toBeTruthy();
    }
  });
});
