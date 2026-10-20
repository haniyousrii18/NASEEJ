import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appT } from '../src/app/i18n/index.js';
import { SnapshotView, type Snapshot } from '../src/app/health/SnapshotView.js';
import { TranslationProvider } from '../src/app/translate/TranslationContext.js';
import { UserText } from '../src/app/translate/UserText.js';
import { dirOf, needsTranslation, scriptOf } from '../src/app/translate/script.js';
import { Translator, type Item } from '../src/app/translate/translator.js';
import { LangProvider, directionOf, useLang } from '../src/context/LangContext.js';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
});

const AR_SYMPTOM = 'ألم في الصدر منذ يومين';
const EN_SYMPTOM = 'Chest pain for two days';

/** A translator that has already answered, so server-side rendering shows the settled state. */
async function settled(map: Record<string, Item>) {
  const t = new Translator(async (texts) => texts.map((x) => map[x] ?? { status: 'unavailable', reason: 'failed' }));
  return t;
}
async function warm(t: Translator, pairs: Array<[string, 'ar' | 'en']>) {
  pairs.forEach(([text, target]) => t.request(text, target));
  await new Promise((r) => setTimeout(r, 5));
}

const render = (lang: 'ar' | 'en', t: Translator | null, node: React.ReactNode) => {
  store.set('naseej_lang', lang);
  const inner = t ? React.createElement(TranslationProvider, { translator: t }, node) : node;
  return renderToStaticMarkup(React.createElement(LangProvider, null, inner));
};

describe('which text needs a translation', () => {
  it('detects the script of typed text and ignores numbers and symbols', () => {
    expect(scriptOf(AR_SYMPTOM)).toBe('ar');
    expect(scriptOf(EN_SYMPTOM)).toBe('en');
    expect(scriptOf('5/10 • 500')).toBe('none');
    expect(scriptOf('Panadol بعد الأكل')).toBe('mixed');
  });
  it('asks for a translation only when the text is in the other language than the page', () => {
    expect(needsTranslation(AR_SYMPTOM, 'en')).toBe(true);
    expect(needsTranslation(AR_SYMPTOM, 'ar')).toBe(false);
    expect(needsTranslation(EN_SYMPTOM, 'ar')).toBe(true);
    expect(needsTranslation(EN_SYMPTOM, 'en')).toBe(false);
  });
  it('leaves numbers, drug names and mixed-language notes exactly as written', () => {
    expect(needsTranslation('٣٩', 'en')).toBe(false);
    expect(needsTranslation('500 mg', 'ar')).toBe(false);
    expect(needsTranslation('Panadol بعد الأكل', 'en')).toBe(false);
    expect(needsTranslation('Panadol بعد الأكل', 'ar')).toBe(false);
  });
  it('gives typed text the direction of its own script', () => {
    expect(dirOf(AR_SYMPTOM)).toBe('rtl');
    expect(dirOf(EN_SYMPTOM)).toBe('ltr');
  });
});

describe('the translator', () => {
  it('batches everything requested in the same tick into one call and caches the answers', async () => {
    const fetcher = vi.fn(async (texts: string[]) => texts.map((x): Item => ({ status: 'ok', text: `T:${x}` })));
    const t = new Translator(fetcher);
    t.request('a', 'en');
    t.request('b', 'en');
    t.request('a', 'en');
    expect(t.peek('a', 'en')).toEqual({ state: 'loading' });
    await new Promise((r) => setTimeout(r, 5));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toEqual(['a', 'b']);
    expect(t.peek('a', 'en')).toEqual({ state: 'ok', text: 'T:a' });
    t.request('a', 'en');
    await new Promise((r) => setTimeout(r, 5));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps the two directions apart', async () => {
    const t = new Translator(async (texts, target) => texts.map((x): Item => ({ status: 'ok', text: `${target}:${x}` })));
    await warm(t, [['x', 'en'], ['x', 'ar']]);
    expect(t.peek('x', 'en')).toEqual({ state: 'ok', text: 'en:x' });
    expect(t.peek('x', 'ar')).toEqual({ state: 'ok', text: 'ar:x' });
  });
  it('treats a failed or throwing request as unavailable, never as a translation', async () => {
    const t = new Translator(async () => {
      throw new Error('boom');
    });
    await warm(t, [['x', 'en']]);
    expect(t.peek('x', 'en')).toEqual({ state: 'unavailable', reason: 'failed' });
  });
  it('stops asking the server once it says translation is off, and asks again after a reset', async () => {
    const fetcher = vi.fn(async (texts: string[]) => texts.map((): Item => ({ status: 'unavailable', reason: 'consent' })));
    const t = new Translator(fetcher);
    await warm(t, [['a', 'en']]);
    await warm(t, [['b', 'en']]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(t.peek('b', 'en')).toEqual({ state: 'unavailable', reason: 'consent' });
    t.reset();
    await warm(t, [['b', 'en']]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('typed text on screen', () => {
  it('English page, Arabic entry: original kept, English translation labelled', async () => {
    const t = await settled({ [AR_SYMPTOM]: { status: 'ok', text: 'Chest pain for two days' } });
    await warm(t, [[AR_SYMPTOM, 'en']]);
    const html = render('en', t, React.createElement(UserText, { text: AR_SYMPTOM }));
    expect(html).toContain(AR_SYMPTOM);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain(appT.en.common.userText.translation);
    expect(html).toContain('Chest pain for two days');
  });

  it('Arabic page, English entry: original kept, Arabic translation labelled', async () => {
    const t = await settled({ [EN_SYMPTOM]: { status: 'ok', text: 'ألم في الصدر منذ يومين' } });
    await warm(t, [[EN_SYMPTOM, 'ar']]);
    const html = render('ar', t, React.createElement(UserText, { text: EN_SYMPTOM }));
    expect(html).toContain(EN_SYMPTOM);
    expect(html).toContain('dir="ltr"');
    expect(html).toContain(appT.ar.common.userText.translation);
    expect(html).toContain(AR_SYMPTOM);
  });

  it('shows no translation chrome for text already in the page language', () => {
    const t = new Translator(async () => null);
    expect(render('en', t, React.createElement(UserText, { text: EN_SYMPTOM }))).not.toContain('na-ut');
    expect(render('ar', t, React.createElement(UserText, { text: AR_SYMPTOM }))).not.toContain('na-ut');
  });

  it('keeps the original and says so when a translation could not be given', async () => {
    const t = await settled({ [AR_SYMPTOM]: { status: 'unavailable', reason: 'uncertain' } });
    await warm(t, [[AR_SYMPTOM, 'en']]);
    const html = render('en', t, React.createElement(UserText, { text: AR_SYMPTOM }));
    expect(html).toContain(AR_SYMPTOM);
    expect(html).toContain(appT.en.common.userText.reasons.uncertain);
    expect(html).not.toContain(appT.en.common.userText.translation + '</span>');
  });

  it('shows a loading note, not a blank, while the translation is on its way', () => {
    const html = render('en', new Translator(async () => new Promise(() => undefined)), React.createElement(UserText, { text: AR_SYMPTOM }));
    expect(html).toContain(AR_SYMPTOM);
    expect(html).toContain('data-state="loading"');
  });

  it('as a hint under an input, shows only the translation and never repeats the original', async () => {
    const t = await settled({ [AR_SYMPTOM]: { status: 'ok', text: 'Chest pain for two days' } });
    await warm(t, [[AR_SYMPTOM, 'en']]);
    const html = render('en', t, React.createElement(UserText, { text: AR_SYMPTOM, hint: true }));
    expect(html).not.toContain('na-ut-orig');
    expect(html).toContain('Chest pain for two days');
  });

  it('renders nothing for empty text', () => {
    expect(render('en', null, React.createElement(UserText, { text: '' }))).toBe('');
    expect(render('en', null, React.createElement(UserText, { text: null }))).toBe('');
  });
});

describe('the clinician view follows the share language, not the app language', () => {
  const snap = (lang: 'ar' | 'en'): Snapshot => ({
    lang,
    patient: null,
    visitDate: null,
    reason: lang === 'en' ? AR_SYMPTOM : EN_SYMPTOM,
    overview: '',
    sections: [{ key: 'symptoms', items: [{ text: lang === 'en' ? AR_SYMPTOM : EN_SYMPTOM, date: null, source: 'x' }] }],
    documents: [],
  });
  it('an English summary is left-to-right and translates Arabic entries into English', async () => {
    const t = await settled({ [AR_SYMPTOM]: { status: 'ok', text: 'Chest pain for two days' } });
    await warm(t, [[AR_SYMPTOM, 'en']]);
    const html = render('ar', t, React.createElement(SnapshotView, { snapshot: snap('en') }));
    expect(html).toContain('<article class="hp-sv" dir="ltr" lang="en">');
    expect(html).toContain('Chest pain for two days');
    expect(html).toContain(AR_SYMPTOM);
  });
  it('an Arabic summary is right-to-left and translates English entries into Arabic', async () => {
    const t = await settled({ [EN_SYMPTOM]: { status: 'ok', text: 'ألم في الصدر منذ يومين' } });
    await warm(t, [[EN_SYMPTOM, 'ar']]);
    const html = render('en', t, React.createElement(SnapshotView, { snapshot: snap('ar') }));
    expect(html).toContain('<article class="hp-sv" dir="rtl" lang="ar">');
    expect(html).toContain(AR_SYMPTOM);
    expect(html).toContain(EN_SYMPTOM);
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
  it('gives Arabic right-to-left and English left-to-right with that language\'s own strings', () => {
    const ar = render('ar', null, React.createElement(Probe));
    const en = render('en', null, React.createElement(Probe));
    expect(ar).toContain('data-lang="ar"');
    expect(ar).toContain('data-rtl="true"');
    expect(en).toContain('data-lang="en"');
    expect(en).toContain('data-rtl="false"');
    expect(ar).not.toEqual(en);
  });
  it('translates the typed-text labels in both languages', () => {
    for (const lang of ['ar', 'en'] as const) {
      const U = appT[lang].common.userText;
      expect(U.translation.length).toBeGreaterThan(0);
      expect(Object.values(U.reasons).every((r) => r.length > 0)).toBe(true);
    }
    expect(appT.ar.common.userText.translation).not.toBe(appT.en.common.userText.translation);
  });
  it('never remounts the interface on a language change, so unsaved input survives the switch', () => {
    // Re-keying a subtree by language would reset every form inside it. Language lives in context only.
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx$/.test(e.name) ? [path.join(dir, e.name)] : []));
    const offenders = walk(path.resolve(__dirname, '../src')).filter((f) => /\bkey=\{[^}]*\b(lang|isRtl)\b[^}]*\}/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
