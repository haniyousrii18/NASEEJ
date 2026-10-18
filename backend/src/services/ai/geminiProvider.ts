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

// OpenAPI-style subset accepted by Gemini's responseSchema.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    document_type: { type: 'string', enum: [...DOCUMENT_TYPES] },
    document_type_confidence: { type: 'number' },
    page_count: { type: 'integer' },
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: [...FACT_KINDS] },
          label: { type: 'string' },
          value: { type: 'string' },
          unit: { type: 'string' },
          date: { type: 'string' },
          page: { type: 'integer' },
          passage: { type: 'string' },
          confidence: { type: 'number' },
          why: { type: 'string' },
        },
        required: ['kind', 'label', 'page', 'passage'],
      },
    },
  },
  required: ['document_type', 'facts'],
};

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

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new ProviderError('AUTH', 'The AI provider rejected the credentials.');
      if (res.status === 429) throw new ProviderError('RATE_LIMIT', 'The AI provider is rate limiting requests.');
      if (res.status === 400 || res.status === 404) throw new ProviderError('UNREADABLE', 'The AI provider could not use this file or model.');
      throw new ProviderError('PROVIDER_ERROR', 'The AI provider request failed.');
    }

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
