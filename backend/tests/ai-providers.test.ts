import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENV } from '../src/config/env.js';
import { GeminiProvider, pickFlashModel } from '../src/services/ai/geminiProvider.js';
import { aiStatus } from '../src/services/ai/index.js';
import { sanitizeAnalysis } from '../src/services/ai/sanitize.js';
import { ProviderError } from '../src/services/ai/types.js';

// Pure unit tests: no database, no network. The Gemini HTTP call is replaced by a stub.
const sample = Buffer.from('%PDF-1.4 stub');
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const geminiText = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }], modelVersion: 'gemini-test' });

const original = { provider: ENV.AI_PROVIDER, key: ENV.GEMINI_API_KEY, model: ENV.AI_MODEL };
afterEach(() => {
  vi.unstubAllGlobals();
  GeminiProvider.discovered = null;
  ENV.AI_MODEL = original.model;
  ENV.AI_PROVIDER = original.provider;
  ENV.GEMINI_API_KEY = original.key;
});

describe('AI status and configuration', () => {
  it('reports AI as off when nothing is configured and never claims a provider', () => {
    ENV.AI_PROVIDER = '';
    ENV.GEMINI_API_KEY = '';
    expect(aiStatus()).toMatchObject({ configured: false, provider: null, dataHandling: 'none' });
  });

  it('needs both the provider name and its key', () => {
    ENV.AI_PROVIDER = 'gemini';
    ENV.GEMINI_API_KEY = '';
    expect(aiStatus().configured).toBe(false);
    ENV.GEMINI_API_KEY = 'test-key-not-real';
    expect(aiStatus()).toMatchObject({ configured: true, provider: 'gemini', dataHandling: 'external_provider' });
  });
});

describe('Gemini provider', () => {
  const configure = () => {
    ENV.AI_PROVIDER = 'gemini';
    ENV.GEMINI_API_KEY = 'test-key-not-real';
  };

  it('sends the key in a header (not the URL) and maps the result through the sanitizer', async () => {
    configure();
    const fetchStub = vi.fn().mockResolvedValue(
      reply(200, geminiText({
        document_type: 'lab_report',
        document_type_confidence: 0.9,
        facts: [
          { kind: 'lab_value', label: 'Hemoglobin', value: '11.2', unit: 'g/dL', page: 1, passage: 'Hemoglobin 11.2 g/dL', confidence: 0.93, why: 'Results table' },
          { kind: 'not-a-kind', label: 'dropped', page: 1, passage: 'x' },
          { kind: 'allergy', label: 'Penicillin', page: 2, passage: 'Known allergy: Penicillin', date: '2026-13-45' },
        ],
      })),
    );
    vi.stubGlobal('fetch', fetchStub);

    const out = await new GeminiProvider().analyze({ buffer: sample, mimeType: 'application/pdf' });

    const [url, init] = fetchStub.mock.calls[0];
    expect(String(url)).not.toContain('test-key-not-real');
    expect((init as RequestInit).headers).toMatchObject({ 'x-goog-api-key': 'test-key-not-real' });
    expect(out.documentType).toBe('lab_report');
    expect(out.facts.map((f) => f.label)).toEqual(['Hemoglobin', 'Penicillin']); // the invalid kind is dropped
    expect(out.facts[1].date).toBeNull(); // an impossible date is not stored
    expect(out.model).toBe('gemini-test');
  });

  it.each([
    [401, 'AUTH'],
    [403, 'AUTH'],
    [429, 'RATE_LIMIT'],
    [400, 'BAD_REQUEST'],
    [404, 'MODEL_NOT_FOUND'],
    [500, 'PROVIDER_ERROR'],
  ])('turns HTTP %i into the %s failure code', async (status, code) => {
    configure();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(status, { error: { message: 'details that must not leak' } })));
    const err = await new GeminiProvider().analyze({ buffer: sample, mimeType: 'application/pdf' }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe(code);
    expect(err.message).not.toContain('details that must not leak');
  });

  it('recognises the wrong-key answer (HTTP 400, API_KEY_INVALID) as an AUTH failure and keeps only the machine code', async () => {
    configure();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(400, { error: { code: 400, message: 'API key not valid. secret text', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } })));
    const err = await new GeminiProvider().analyze({ buffer: sample, mimeType: 'application/pdf' }).catch((e) => e);
    expect(err.code).toBe('AUTH');
    expect(err.detail).toBe('API_KEY_INVALID');
    expect(err.message).not.toContain('secret text');
  });

  it('never keeps free text as the failure detail', async () => {
    configure();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(400, { error: { status: 'contains the patient name', details: [{ reason: 'Free text with spaces' }] } })));
    const err = await new GeminiProvider().analyze({ buffer: sample, mimeType: 'application/pdf' }).catch((e) => e);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.detail).toBeUndefined();
  });

  it('refuses malformed or empty output instead of inventing a result', async () => {
    configure();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, { candidates: [{ content: { parts: [{ text: 'not json' }] } }] })));
    expect(await new GeminiProvider().analyze({ buffer: sample, mimeType: 'application/pdf' }).catch((e) => e.code)).toBe('INVALID_OUTPUT');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, { candidates: [] })));
    expect(await new GeminiProvider().analyze({ buffer: sample, mimeType: 'application/pdf' }).catch((e) => e.code)).toBe('INVALID_OUTPUT');
  });

  it('does nothing without a key', async () => {
    ENV.AI_PROVIDER = 'gemini';
    ENV.GEMINI_API_KEY = '';
    const fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);
    expect(await new GeminiProvider().analyze({ buffer: sample, mimeType: 'application/pdf' }).catch((e) => e.code)).toBe('NOT_CONFIGURED');
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe('Gemini model selection', () => {
  const m = (name: string, methods = ['generateContent']) => ({ name: 'models/' + name, supportedGenerationMethods: methods });

  it('picks the newest stable Flash model that can generate content', () => {
    expect(
      pickFlashModel([
        m('gemini-2.5-flash'),
        m('gemini-3.10-flash'),
        m('gemini-3.9-flash'),
        m('gemini-4.0-flash-lite'),
        m('gemini-4.0-flash-image'),
        m('gemini-4.0-flash-preview-05'),
        m('gemini-3.9-pro'),
        m('gemini-5.0-flash', ['embedContent']),
        m('text-embedding-004'),
      ]),
    ).toBe('gemini-3.10-flash');
  });

  it('falls back to a preview when no stable Flash exists, and to null when nothing fits', () => {
    expect(pickFlashModel([m('gemini-4.0-flash-preview-05'), m('gemini-3.0-pro')])).toBe('gemini-4.0-flash-preview-05');
    expect(pickFlashModel([m('gemini-3.0-pro')])).toBeNull();
  });

  it('retries once with a discovered model when the default is not served, then remembers it', async () => {
    ENV.AI_PROVIDER = 'gemini';
    ENV.GEMINI_API_KEY = 'test-key-not-real';
    ENV.AI_MODEL = '';
    const ok = geminiText({ document_type: 'lab_report', facts: [] });
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(reply(404, { error: { status: 'NOT_FOUND' } }))
      .mockResolvedValueOnce(reply(200, { models: [m('gemini-3.8-flash'), m('gemini-2.5-flash-lite')] }))
      .mockResolvedValueOnce(reply(200, ok));
    vi.stubGlobal('fetch', fetchStub);

    const provider = new GeminiProvider();
    const out = await provider.analyze({ buffer: sample, mimeType: 'application/pdf' });

    expect(out.documentType).toBe('lab_report');
    expect(String(fetchStub.mock.calls[0][0])).toContain('/gemini-flash-latest:generateContent');
    expect(String(fetchStub.mock.calls[2][0])).toContain('/gemini-3.8-flash:generateContent');
    expect(new GeminiProvider().model).toBe('gemini-3.8-flash');
  });

  it('does not second-guess a model the operator chose', async () => {
    ENV.AI_PROVIDER = 'gemini';
    ENV.GEMINI_API_KEY = 'test-key-not-real';
    ENV.AI_MODEL = 'my-own-model';
    const fetchStub = vi.fn().mockResolvedValue(reply(404, { error: { status: 'NOT_FOUND' } }));
    vi.stubGlobal('fetch', fetchStub);
    const err = await new GeminiProvider().analyze({ buffer: sample, mimeType: 'application/pdf' }).catch((e) => e);
    expect(err.code).toBe('MODEL_NOT_FOUND');
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});

describe('sanitizer', () => {
  it('bounds provider output', () => {
    const out = sanitizeAnalysis({ document_type: 'weird', facts: Array.from({ length: 100 }, (_, i) => ({ kind: 'other', label: `item ${i}`, page: 1, passage: 'p'.repeat(2000) })) });
    expect(out.documentType).toBe('other');
    expect(out.facts.length).toBe(60);
    expect(out.facts[0].passage!.length).toBe(600);
  });
});
