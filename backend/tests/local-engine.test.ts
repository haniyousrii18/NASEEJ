import fs from 'fs';
import path from 'path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/config/db.js';
import { ENV } from '../src/config/env.js';
import { localProvider, machineTranslate } from '../src/services/translation/localEngine.js';
import { MODEL_DIR, MODELS } from '../src/services/translation/models.js';
import { contentTokens, MIN_RECALL, plausible, recall } from '../src/services/translation/quality.js';
import { registerTranslationProvider, unregisterTranslationProvider } from '../src/services/translation/provider.js';
import { translateForPatient } from '../src/services/translation/service.js';

const installed = Object.values(MODELS).every((m) => fs.existsSync(path.join(MODEL_DIR, m, 'onnx')));

describe('quality gate', () => {
  it('reads content words in both languages and ignores stop words', () => {
    expect(contentTokens('ألم شديد في الصدر', 'ar')).toEqual(['الم', 'شديد', 'صدر']);
    expect(contentTokens('The doctor asked for a blood test', 'en')).toEqual(['doctor', 'ask', 'blood', 'test']);
  });
  it('a faithful round trip recovers the original words; a dropped concept does not', () => {
    expect(recall('ألم شديد في الصدر منذ يومين', 'ألم شديد في الصدر قبل يومين', 'ar')).toBe(1);
    expect(recall('زيارة متابعة القلب', 'فحص القلب', 'ar')).toBeLessThan(MIN_RECALL);
  });
  it('rejects implausible output', () => {
    expect(plausible('Chest pain', '', 'ar')).toBe(false);
    expect(plausible('Chest pain', 'ألم ألم ألم ألم ألم ألم ألم ألم ألم ألم ألم ألم ألم ألم ألم ألم ألم', 'ar')).toBe(false);
    expect(plausible('Chest pain', '(ب) مدى التنقّس', 'ar')).toBe(false);
    expect(plausible('ألم في الصدر', 'Pain in the chest ألم', 'en')).toBe(false);
    expect(plausible('Chest pain', 'ألم الصدر', 'ar')).toBe(true);
  });
});

describe('machine translation is kept only when it survives the round trip', () => {
  const fake = (table: Record<string, string>) => async (text: string) => table[text] ?? null;
  it('accepts a translation whose back-translation recovers the original', async () => {
    const t = fake({ 'أشعر بدوار وغثيان': 'I feel dizzy and nauseous', 'I feel dizzy and nauseous': 'أشعر بدوار وغثيان' });
    expect(await machineTranslate('أشعر بدوار وغثيان', 'ar', 'en', t)).toBe('I feel dizzy and nauseous');
  });
  it('rejects a fluent translation that lost part of the meaning', async () => {
    const t = fake({ 'زيارة متابعة القلب': 'Heart check.', 'Heart check.': 'فحص القلب' });
    expect(await machineTranslate('زيارة متابعة القلب', 'ar', 'en', t)).toBeNull();
  });
  it('rejects when the engine returns nothing', async () => {
    expect(await machineTranslate('ألم', 'ar', 'en', fake({}))).toBeNull();
  });
});

describe('the local provider', () => {
  it('is a registered non-AI provider', () => {
    expect(localProvider.ai).toBe(false);
    expect(localProvider.name).toBe('local');
    expect(localProvider.isConfigured()).toBe(true);
  });
  it('uses the exact glossary first, in both directions', async () => {
    expect(await localProvider.translate(['زيارة متابعة القلب'], 'ar', 'en')).toEqual([{ text: 'Heart follow-up visit', engine: 'glossary' }]);
    expect(await localProvider.translate(['Severe headache'], 'en', 'ar')).toEqual([{ text: 'صداع شديد', engine: 'glossary' }]);
  });
  it('returns null (never a guess) for wording it cannot translate reliably', async () => {
    process.env.TRANSLATION_MT = 'off';
    try {
      expect(await localProvider.translate(['أشعر بدوار غريب'], 'ar', 'en')).toEqual([null]);
    } finally {
      delete process.env.TRANSLATION_MT;
    }
  });
  it.skipIf(!installed)('with the models installed, machine-translates free wording and labels it local-mt', async () => {
    const out = await localProvider.translate(['I feel dizzy and nauseous after eating'], 'en', 'ar');
    expect(out[0]).toMatchObject({ engine: 'local-mt' });
    expect((out[0] as { text: string }).text).toContain('الدوار');
  }, 120_000);
  it.skipIf(!installed)('with the models installed, rejects a translation that turns an x-ray into an exam', async () => {
    const out = await localProvider.translate(['The doctor asked me to get a blood test and an x-ray'], 'en', 'ar');
    expect(out[0]).toBeNull();
  }, 120_000);
});

describe('through the stored-translation service', () => {
  let patientId = '';
  const original = ENV.TRANSLATION_PROVIDER;
  beforeAll(async () => {
    patientId = (await pool.query('SELECT id FROM patient_profiles ORDER BY created_at LIMIT 1')).rows[0].id;
  });
  afterEach(async () => {
    ENV.TRANSLATION_PROVIDER = original;
    unregisterTranslationProvider('local');
    await pool.query('DELETE FROM content_translations WHERE patient_id = $1', [patientId]);
  });
  it('stores the engine that made each translation and returns it', async () => {
    registerTranslationProvider(localProvider);
    ENV.TRANSLATION_PROVIDER = 'local';
    const first = await translateForPatient(patientId, ['زيارة متابعة القلب'], 'en');
    expect(first[0]).toEqual({ status: 'ok', text: 'Heart follow-up visit', from: 'ar', provider: 'glossary' });
    const stored = await pool.query('SELECT provider, translated_text FROM content_translations WHERE patient_id = $1', [patientId]);
    expect(stored.rows).toEqual([{ provider: 'glossary', translated_text: 'Heart follow-up visit' }]);
    expect((await translateForPatient(patientId, ['زيارة متابعة القلب'], 'en'))[0]).toMatchObject({ provider: 'glossary' });
  });
});
