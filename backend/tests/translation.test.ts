import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { ENV } from '../src/config/env.js';
import { pool } from '../src/config/db.js';
import { detectLang } from '../src/services/translation/language.js';
import { registerTranslationProvider, unregisterTranslationProvider, type TranslationProvider } from '../src/services/translation/provider.js';
import { numbersIn, parseTarget, parseTexts, preservesNumbers, stringsIn, translateForPatient } from '../src/services/translation/service.js';
import { as, call } from './helpers.js';

// Pure logic plus the stored-translation flow. The provider is a stub registered for the test: the project ships none.
const AR = 'ألم في الصدر منذ يومين';
const EN = 'Chest pain for two days';

let patientId = '';
beforeAll(async () => {
  patientId = (await pool.query('SELECT id FROM patient_profiles ORDER BY created_at LIMIT 1')).rows[0].id;
});

const stub = (map: Record<string, string | null>, name = 'stub-engine') => {
  const translate = vi.fn(async (texts: string[]) => texts.map((t) => map[t] ?? null));
  const provider: TranslationProvider = { name, ai: false, isConfigured: () => true, translate };
  registerTranslationProvider(provider);
  ENV.TRANSLATION_PROVIDER = name;
  return translate;
};

const original = ENV.TRANSLATION_PROVIDER;
afterEach(async () => {
  unregisterTranslationProvider('stub-engine');
  ENV.TRANSLATION_PROVIDER = original;
  await pool.query('DELETE FROM content_translations WHERE patient_id = $1', [patientId]);
});

describe('language detection', () => {
  it('tells Arabic, English, mixed and language-free text apart', () => {
    expect(detectLang(AR)).toBe('ar');
    expect(detectLang(EN)).toBe('en');
    expect(detectLang('Panadol بعد الأكل')).toBe('mixed');
    expect(detectLang('٣٩')).toBe('none');
    expect(detectLang('500 mg')).toBe('none');
    expect(detectLang('5/10')).toBe('none');
  });
});

describe('input and number safety', () => {
  it('accepts 1 to 20 non-empty strings and only ar or en as a target', () => {
    expect(parseTexts([AR])).toEqual([AR]);
    expect(parseTexts([])).toBeNull();
    expect(parseTexts(['  '])).toBeNull();
    expect(parseTexts(Array(21).fill('a'))).toBeNull();
    expect(parseTexts(['x'.repeat(2001)])).toBeNull();
    expect(parseTarget('ar')).toBe('ar');
    expect(parseTarget('fr')).toBeNull();
  });
  it('reads Arabic-Indic and Western digits as the same numbers', () => {
    expect(numbersIn('٣٩٫٥ درجة لمدة ٣ أيام')).toEqual(['39.5', '3']);
  });
  it('rejects a translation that changes, drops or adds a number, but accepts the Arabic dual for a 2', () => {
    expect(preservesNumbers('حمى ٣٩ لمدة ٣ أيام', 'Fever 39 for 3 days')).toBe(true);
    expect(preservesNumbers('حمى ٣٩', 'Fever 38')).toBe(false);
    expect(preservesNumbers('ألم', 'Pain 2 times')).toBe(false);
    expect(preservesNumbers('Chest pain for 2 days', 'ألم في الصدر منذ يومين')).toBe(true);
    expect(preservesNumbers('Chest pain for 3 days', 'ألم في الصدر منذ يومين')).toBe(false);
  });
  it('collects every string inside a snapshot', () => {
    const s = stringsIn({ reason: ' ألم ', sections: [{ items: [{ text: 'سعال' }] }], n: 3 });
    expect(s.has('ألم') && s.has('سعال')).toBe(true);
    expect(s.has('other')).toBe(false);
  });
});

describe('with no provider configured', () => {
  it('says plainly that no translation is available, and never invents one', async () => {
    ENV.TRANSLATION_PROVIDER = '';
    const out = await translateForPatient(patientId, [AR, EN, '5/10', 'Panadol بعد الأكل'], 'en');
    expect(out[0]).toEqual({ status: 'unavailable', reason: 'no_provider' });
    expect(out[1]).toEqual({ status: 'same' });
    expect(out[2]).toEqual({ status: 'same' });
    expect(out[3]).toEqual({ status: 'unavailable', reason: 'mixed' });
  });
  it('treats a named but unregistered provider as off', async () => {
    ENV.TRANSLATION_PROVIDER = 'does-not-exist';
    expect((await translateForPatient(patientId, [AR], 'en'))[0]).toEqual({ status: 'unavailable', reason: 'no_provider' });
  });
});

describe('with an approved non-AI provider', () => {
  it('translates both directions and stores the result once', async () => {
    const translate = stub({ [AR]: 'Chest pain since two days', [EN]: 'ألم في الصدر لمدة يومين' });
    const toEn = await translateForPatient(patientId, [AR], 'en');
    expect(toEn[0]).toEqual({ status: 'ok', text: 'Chest pain since two days', from: 'ar', provider: 'stub-engine' });
    const toAr = await translateForPatient(patientId, [EN], 'ar');
    expect(toAr[0]).toMatchObject({ status: 'ok', text: 'ألم في الصدر لمدة يومين', from: 'en' });
    expect(translate).toHaveBeenCalledTimes(2);

    // Asking again, from any screen, reads the stored row and does not call the engine.
    await translateForPatient(patientId, [AR], 'en');
    await translateForPatient(patientId, [AR], 'en');
    expect(translate).toHaveBeenCalledTimes(2);
    const rows = await pool.query('SELECT count(*)::int AS n FROM content_translations WHERE patient_id = $1', [patientId]);
    expect(rows.rows[0].n).toBe(2);
  });

  it('translates edited text afresh and never shows the old translation for the new wording', async () => {
    const translate = stub({ [AR]: 'Chest pain', 'ألم شديد في الصدر': 'Severe chest pain' });
    expect((await translateForPatient(patientId, [AR], 'en'))[0]).toMatchObject({ text: 'Chest pain' });
    expect((await translateForPatient(patientId, ['ألم شديد في الصدر'], 'en'))[0]).toMatchObject({ text: 'Severe chest pain' });
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it('keeps the original untouched: only derived text is stored', async () => {
    stub({ [AR]: 'Chest pain' });
    await translateForPatient(patientId, [AR], 'en');
    const row = (await pool.query('SELECT * FROM content_translations WHERE patient_id = $1', [patientId])).rows[0];
    expect(Object.keys(row)).not.toContain('source_text');
    expect(row.source_hash).toHaveLength(64);
    expect(JSON.stringify(row)).not.toContain(AR);
  });

  it('shows the original with "uncertain" when the engine cannot translate, and stores nothing', async () => {
    stub({});
    expect((await translateForPatient(patientId, [AR], 'en'))[0]).toEqual({ status: 'unavailable', reason: 'uncertain' });
    expect((await pool.query('SELECT count(*)::int AS n FROM content_translations WHERE patient_id = $1', [patientId])).rows[0].n).toBe(0);
  });

  it('rejects a translation that changes a number', async () => {
    stub({ 'صداع ٣ أيام': 'Headache 4 days' });
    expect((await translateForPatient(patientId, ['صداع ٣ أيام'], 'en'))[0]).toEqual({ status: 'unavailable', reason: 'uncertain' });
  });

  it('reports "failed" when the engine throws, and retries next time', async () => {
    const translate = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(['Chest pain']);
    registerTranslationProvider({ name: 'stub-engine', ai: false, isConfigured: () => true, translate });
    ENV.TRANSLATION_PROVIDER = 'stub-engine';
    expect((await translateForPatient(patientId, [AR], 'en'))[0]).toEqual({ status: 'unavailable', reason: 'failed' });
    expect((await translateForPatient(patientId, [AR], 'en'))[0]).toMatchObject({ status: 'ok' });
  });

  it('never asks the engine about text that needs no translation', async () => {
    const translate = stub({});
    await translateForPatient(patientId, [EN, '500 mg', '7/10'], 'en');
    expect(translate).not.toHaveBeenCalled();
  });
});

describe('POST /api/translations', () => {
  it('needs a signed-in patient and a valid body', async () => {
    expect((await request(app).post('/api/translations').send({ texts: ['x'], target: 'en' })).status).toBe(401);
    const token = await as.patient();
    expect((await call('post', '/api/translations', token).send({ texts: [], target: 'en' })).status).toBe(400);
    expect((await call('post', '/api/translations', token).send({ texts: ['x'], target: 'fr' })).status).toBe(400);
  });
  it('answers per text, with no AI consent involved', async () => {
    ENV.TRANSLATION_PROVIDER = '';
    const token = await as.patient();
    await call('post', '/api/assistant/consent', token).send({ allowed: false });
    const res = await call('post', '/api/translations', token).send({ texts: [AR, EN], target: 'en' });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([{ status: 'unavailable', reason: 'no_provider' }, { status: 'same' }]);
  });
  it('returns a stored translation through the API', async () => {
    stub({ [AR]: 'Chest pain since two days' });
    const token = await as.patient();
    const res = await call('post', '/api/translations', token).send({ texts: [AR], target: 'en' });
    expect(res.body.data.items[0]).toMatchObject({ status: 'ok', text: 'Chest pain since two days', from: 'ar' });
  });
});

describe('POST /api/share-view/translate', () => {
  it('does not work without a valid share token', async () => {
    expect((await request(app).post('/api/share-view/translate').send({ token: 'x'.repeat(43), texts: [AR], target: 'en' })).status).toBe(404);
    expect((await request(app).post('/api/share-view/translate').send({ token: 'x'.repeat(43), texts: [], target: 'en' })).status).toBe(400);
  });
});
