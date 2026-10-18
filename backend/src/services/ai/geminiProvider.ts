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
// A documented alias that Google points at its newest Flash model, so the default does not go stale when a model is retired.
const DEFAULT_MODEL = 'gemini-flash-latest';
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

/** Compares dotted versions numerically: 3.10 is newer than 3.9. */
const versionOf = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
const newer = (a: string, b: string) => {
  const x = versionOf(a);
  const y = versionOf(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

/**
 * From Google's model list, the newest plain Flash model that can generate content. Stable releases win over
 * previews; lite, image, audio, live, thinking and experimental variants are skipped.
 */
export function pickFlashModel(models: Array<{ name?: string; supportedGenerationMethods?: string[] }>): string | null {
  let best: { id: string; version: string; preview: boolean } | null = null;
  for (const m of models) {
    const match = /^models\/(gemini-(\d+(?:\.\d+)*)-flash(-[a-z0-9-]+)?)$/.exec(m?.name ?? '');
    if (!match || !m.supportedGenerationMethods?.includes('generateContent')) continue;
    const suffix = match[3] ?? '';
    if (/lite|image|tts|live|audio|thinking|exp|embedding|vision/.test(suffix)) continue;
    const candidate = { id: match[1], version: match[2], preview: suffix.includes('preview') };
    if (!best || (best.preview && !candidate.preview) || (best.preview === candidate.preview && newer(candidate.version, best.version))) best = candidate;
  }
  return best?.id ?? null;
}

export class GeminiProvider implements DocumentAnalysisProvider {
  /** The model found by asking Google, kept for this process so the list is requested once. */
  static discovered: string | null = null;
  readonly name = 'gemini';
  get model(): string {
    return ENV.AI_MODEL || GeminiProvider.discovered || DEFAULT_MODEL;
  }

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

    let res = await this.generate(this.model, body);
    // A model name that Google no longer serves (for example a retired version) is a 404. When the model was not chosen
    // by the operator, ask Google which Flash model is available and retry once.
    if (res.status === 404 && !ENV.AI_MODEL) {
      const found = await this.discoverModel();
      if (found && found !== this.model) {
        GeminiProvider.discovered = found;
        res = await this.generate(found, body);
      }
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

  private async generate(model: string, body: unknown): Promise<Response> {
    try {
      return await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ENV.GEMINI_API_KEY },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ENV.AI_TIMEOUT_MS),
      });
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new ProviderError('TIMEOUT', 'The AI provider timed out.');
      throw new ProviderError('PROVIDER_ERROR', 'The AI provider request failed.');
    }
  }

  private async discoverModel(): Promise<string | null> {
    try {
      const res = await fetch(`${ENDPOINT}?pageSize=200`, {
        headers: { 'x-goog-api-key': ENV.GEMINI_API_KEY },
        signal: AbortSignal.timeout(Math.min(ENV.AI_TIMEOUT_MS, 20000)),
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      return pickFlashModel(Array.isArray(json?.models) ? json.models : []);
    } catch {
      return null;
    }
  }
}
