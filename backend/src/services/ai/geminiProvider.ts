import { ENV } from '../../config/env.js';
import { SYSTEM } from './prompt.js';
import { sanitizeAnalysis } from './sanitize.js';
import { AnalyzeInput, DOCUMENT_TYPES, DocumentAnalysis, DocumentAnalysisProvider, FACT_KINDS, ProviderError } from './types.js';

/**
 * Document analysis through the Google Gemini API (PDF and image input, structured JSON output).
 * Plain HTTPS with `fetch`: no SDK, so there is nothing extra to install. The key is read from the environment on the
 * server and sent in a header, never in the URL.
 *
 * Data handling: on Google's free tier, prompts and files may be used to improve Google's products and may be seen by
 * human reviewers. Use synthetic documents only unless you are on a paid plan that excludes this.
 */
const DEFAULT_MODEL = 'gemini-2.5-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// OpenAPI-style subset accepted by Gemini's responseSchema (type names in upper case, as the REST docs show).
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    document_type: { type: 'STRING', enum: [...DOCUMENT_TYPES] },
    document_type_confidence: { type: 'NUMBER' },
    page_count: { type: 'INTEGER' },
    facts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: [...FACT_KINDS] },
          label: { type: 'STRING' },
          value: { type: 'STRING' },
          unit: { type: 'STRING' },
          date: { type: 'STRING' },
          page: { type: 'INTEGER' },
          passage: { type: 'STRING' },
          confidence: { type: 'NUMBER' },
          why: { type: 'STRING' },
        },
        required: ['kind', 'label', 'page', 'passage'],
      },
    },
  },
  required: ['document_type', 'facts'],
};

/**
 * Google reports a wrong API key as HTTP 400 (reason API_KEY_INVALID), not 401, so the status alone cannot tell a bad
 * key from a bad request. Only machine codes are read from the error body; its free text is never kept or logged.
 */
async function failureFor(res: Response): Promise<ProviderError> {
  let status = '';
  let reason = '';
  try {
    const body: any = await res.json();
    status = typeof body?.error?.status === 'string' ? body.error.status : '';
    const info = (body?.error?.details ?? []).find((d: any) => typeof d?.reason === 'string');
    reason = info?.reason ?? '';
  } catch {
    /* no readable body */
  }
  const safe = (v: string) => (/^[A-Z0-9_]{1,60}$/.test(v) ? v : '');
  const detail = safe(reason) || safe(status) || undefined;

  if (res.status === 401 || res.status === 403 || reason === 'API_KEY_INVALID' || reason === 'API_KEY_NOT_FOUND') {
    return new ProviderError('AUTH', 'The AI provider rejected the credentials.', detail);
  }
  if (res.status === 429) return new ProviderError('RATE_LIMIT', 'The AI provider is rate limiting requests.', detail);
  if (res.status === 404 || status === 'NOT_FOUND') return new ProviderError('MODEL_NOT_FOUND', 'The AI provider does not know this model.', detail);
  if (res.status === 400) return new ProviderError('BAD_REQUEST', 'The AI provider rejected the request.', detail);
  return new ProviderError('PROVIDER_ERROR', 'The AI provider request failed.', detail);
}

export class GeminiProvider implements DocumentAnalysisProvider {
  readonly name = 'gemini';
  readonly model = ENV.AI_MODEL || DEFAULT_MODEL;

  isConfigured(): boolean {
    return ENV.AI_PROVIDER === 'gemini' && ENV.GEMINI_API_KEY.length > 0;
  }

  async analyze({ buffer, mimeType }: AnalyzeInput): Promise<DocumentAnalysis> {
    if (!this.isConfigured()) throw new ProviderError('NOT_CONFIGURED', 'The AI provider is not configured.');

    const body = {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: mimeType, data: buffer.toString('base64') } },
            { text: 'Analyze this document. Return only the JSON described by the schema.' },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0 },
    };

    let res: Response;
    try {
      res = await fetch(`${ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ENV.GEMINI_API_KEY },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ENV.AI_TIMEOUT_MS),
      });
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new ProviderError('TIMEOUT', 'The AI provider timed out.');
      throw new ProviderError('PROVIDER_ERROR', 'The AI provider request failed.');
    }

    if (!res.ok) throw await failureFor(res);

    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new ProviderError('INVALID_OUTPUT', 'The provider returned an unreadable response.');
    }
    if (json?.promptFeedback?.blockReason) throw new ProviderError('UNREADABLE', 'The AI provider declined to read this file.');
    const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('');
    if (!text) throw new ProviderError('INVALID_OUTPUT', 'The provider returned no structured result.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ProviderError('INVALID_OUTPUT', 'The provider returned malformed JSON.');
    }
    return { ...sanitizeAnalysis(parsed), model: json?.modelVersion || this.model };
  }
}
