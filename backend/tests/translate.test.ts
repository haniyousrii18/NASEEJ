import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { ENV } from '../src/config/env.js';
import { clearTranslationCache, numbersIn, parseTarget, parseTexts, preservesNumbers, shapeTranslations, stringsIn, translateTexts } from '../src/services/health/translate.js';
import { as, call } from './helpers.js';

const original = { provider: ENV.AI_PROVIDER, key: ENV.GEMINI_API_KEY };
afterEach(() => {
  vi.unstubAllGlobals();
  ENV.AI_PROVIDER = original.provider;
  ENV.GEMINI_API_KEY = original.key;
  clearTranslationCache();
});

const gemini = (obj: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const configure = () => {
  ENV.AI_PROVIDER = 'gemini';
  ENV.GEMINI_API_KEY = 'test-key-not-real';
};

describe('translation input and number safety', () => {
  it('accepts 1 to 20 non-empty strings and only ar or en as a target', () => {
    expect(parseTexts(['ألم في الصدر'])).toEqual(['ألم في الصدر']);
    expect(parseTexts([])).toBeNull();
    expect(parseTexts(['  '])).toBeNull();
    expect(parseTexts([1])).toBeNull();
    expect(parseTexts(Array(21).fill('a'))).toBeNull();
    expect(parseTexts(['x'.repeat(2001)])).toBeNull();
    expect(parseTarget('ar')).toBe('ar');
    expect(parseTarget('fr')).toBeNull();
  });

  it('reads Arabic-Indic and Western digits as the same numbers', () => {
    expect(numbersIn('٣٩٫٥ درجة لمدة ٣ أيام')).toEqual(['39.5', '3']);
    expect(numbersIn('fever 39.5 for 3 days')).toEqual(['39.5', '3']);
  });

  it('rejects a translation that changes, drops or adds a number', () => {
    expect(preservesNumbers('حمى ٣٩ لمدة ٣ أيام', 'Fever 39 for 3 days')).toBe(true);
    expect(preservesNumbers('حمى ٣٩ لمدة ٣ أيام', 'Fever 38 for 3 days')).toBe(false);
    expect(preservesNumbers('حمى ٣٩ لمدة ٣ أيام', 'Fever for days')).toBe(false);
    expect(preservesNumbers('ألم في الصدر', 'Chest pain 2 times')).toBe(false);
  });

  it('accepts the Arabic dual for a 2, but only for a 2', () => {
    expect(preservesNumbers('Chest pain for 2 days', 'ألم في الصدر منذ يومين')).toBe(true);
    expect(preservesNumbers('Pain 7/10 for 2 days', 'ألم 7/10 منذ يومين')).toBe(true);
    expect(preservesNumbers('Chest pain for 3 days', 'ألم في الصدر منذ يومين')).toBe(false);
    expect(preservesNumbers('Chest pain for 2 days', 'ألم في الصدر منذ أيام')).toBe(false);
    expect(preservesNumbers('Chest pain for 2 days', 'ألم في الصدر منذ 3 أيام')).toBe(false);
  });
});

describe('shaping the provider reply', () => {
  const texts = ['ألم في الصدر', 'صداع ٣ أيام', 'غير واضح'];
  it('keeps confident translations and marks everything else unavailable', () => {
    const out = shapeTranslations(
      {
        translations: [
          { index: 0, translation: 'Chest pain', confident: true },
          { index: 1, translation: 'Headache for 4 days', confident: true }, // number changed
          { index: 2, translation: 'Unclear', confident: false },
        ],
      },
      texts,
    );
    expect(out[0]).toEqual({ status: 'ok', text: 'Chest pain' });
    expect(out[1]).toEqual({ status: 'unavailable', reason: 'uncertain' });
    expect(out[2]).toEqual({ status: 'unavailable', reason: 'uncertain' });
  });
  it('treats a missing or malformed reply as unavailable, never as an empty translation', () => {
    expect(shapeTranslations(null, texts).every((i) => i.status === 'unavailable')).toBe(true);
    expect(shapeTranslations({ translations: [{ index: 0, translation: '   ', confident: true }] }, [texts[0]])[0].status).toBe('unavailable');
  });
});

describe('translateTexts', () => {
  it('reports not_configured when AI is off, without calling anything', async () => {
    ENV.AI_PROVIDER = '';
    const fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);
    expect(await translateTexts(['ألم'], 'en')).toEqual([{ status: 'unavailable', reason: 'not_configured' }]);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('translates in both directions, sends the key in a header, and caches successes', async () => {
    configure();
    const fetchStub = vi.fn().mockResolvedValue(gemini({ translations: [{ index: 0, translation: 'Chest pain', confident: true }] }));
    vi.stubGlobal('fetch', fetchStub);
    expect(await translateTexts(['ألم في الصدر'], 'en')).toEqual([{ status: 'ok', text: 'Chest pain' }]);
    expect((fetchStub.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'x-goog-api-key': 'test-key-not-real' });
    expect(String(fetchStub.mock.calls[0][0])).not.toContain('test-key-not-real');
    expect(await translateTexts(['ألم في الصدر'], 'en')).toEqual([{ status: 'ok', text: 'Chest pain' }]);
    expect(fetchStub).toHaveBeenCalledTimes(1);

    fetchStub.mockResolvedValueOnce(gemini({ translations: [{ index: 0, translation: 'ألم في الصدر', confident: true }] }));
    expect(await translateTexts(['Chest pain'], 'ar')).toEqual([{ status: 'ok', text: 'ألم في الصدر' }]);
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it('turns a provider failure into unavailable and does not cache it', async () => {
    configure();
    const fetchStub = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 429 })).mockResolvedValueOnce(gemini({ translations: [{ index: 0, translation: 'Cough', confident: true }] }));
    vi.stubGlobal('fetch', fetchStub);
    expect(await translateTexts(['سعال'], 'en')).toEqual([{ status: 'unavailable', reason: 'busy' }]);
    expect(await translateTexts(['سعال'], 'en')).toEqual([{ status: 'ok', text: 'Cough' }]);
  });
});

describe('stringsIn', () => {
  it('collects every string inside a snapshot, so a share only translates its own wording', () => {
    const s = stringsIn({ reason: ' ألم ', sections: [{ items: [{ text: 'سعال', date: null }] }], n: 3 });
    expect(s.has('ألم')).toBe(true);
    expect(s.has('سعال')).toBe(true);
    expect(s.has('something else')).toBe(false);
  });
});

describe('POST /api/translate', () => {
  it('needs a signed-in patient and a valid body', async () => {
    expect((await request(app).post('/api/translate').send({ texts: ['x'], target: 'en' })).status).toBe(401);
    const token = await as.patient();
    expect((await call('post', '/api/translate', token).send({ texts: [], target: 'en' })).status).toBe(400);
    expect((await call('post', '/api/translate', token).send({ texts: ['x'], target: 'fr' })).status).toBe(400);
  });

  it('returns the original-only answer when the patient has not turned the assistant on', async () => {
    const token = await as.patient();
    await call('post', '/api/assistant/consent', token).send({ allowed: false });
    const res = await call('post', '/api/translate', token).send({ texts: ['ألم في الصدر'], target: 'en' });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([{ status: 'unavailable', reason: 'consent' }]);
  });

  it('reports not_configured once permission is given but the server has no AI', async () => {
    const token = await as.patient();
    await call('post', '/api/assistant/consent', token).send({ allowed: true });
    const res = await call('post', '/api/translate', token).send({ texts: ['ألم في الصدر'], target: 'en' });
    await call('post', '/api/assistant/consent', token).send({ allowed: false });
    expect(res.body.data.items).toEqual([{ status: 'unavailable', reason: 'not_configured' }]);
  });
});

describe('POST /api/share-view/translate', () => {
  it('does not work without a valid share token', async () => {
    const res = await request(app).post('/api/share-view/translate').send({ token: 'x'.repeat(43), texts: ['ألم'], target: 'en' });
    expect(res.status).toBe(404);
    expect((await request(app).post('/api/share-view/translate').send({ token: 'x'.repeat(43), texts: [], target: 'en' })).status).toBe(400);
  });
});
