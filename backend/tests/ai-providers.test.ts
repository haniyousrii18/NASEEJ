import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENV } from '../src/config/env.js';
import { GeminiProvider } from '../src/services/ai/geminiProvider.js';
import { aiStatus } from '../src/services/ai/index.js';
import { sanitizeAnalysis } from '../src/services/ai/sanitize.js';
import { ProviderError } from '../src/services/ai/types.js';

// Pure unit tests: no database, no network. The Gemini HTTP call is replaced by a stub.
const sample = Buffer.from('%PDF-1.4 stub');
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const geminiText = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }], modelVersion: 'gemini-test' });

const original = { provider: ENV.AI_PROVIDER, key: ENV.GEMINI_API_KEY };
afterEach(() => {
  vi.unstubAllGlobals();
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
    [400, 'UNREADABLE'],
    [500, 'PROVIDER_ERROR'],
  ])('turns HTTP %i into the %s failure code', async (status, code) => {
    configure();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(status, { error: { message: 'details that must not leak' } })));
    const err = await new GeminiProvider().analyze({ buffer: sample, mimeType: 'application/pdf' }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe(code);
    expect(err.message).not.toContain('details that must not leak');
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

describe('sanitizer', () => {
  it('bounds provider output', () => {
    const out = sanitizeAnalysis({ document_type: 'weird', facts: Array.from({ length: 100 }, (_, i) => ({ kind: 'other', label: `item ${i}`, page: 1, passage: 'p'.repeat(2000) })) });
    expect(out.documentType).toBe('other');
    expect(out.facts.length).toBe(60);
    expect(out.facts[0].passage!.length).toBe(600);
  });
});
