import { ENV } from '../../config/env.js';
import { ProviderError } from './types.js';

/**
 * The boundary between the patient assistant and any language-model provider. A provider receives a system
 * instruction, a short conversation and a JSON schema, and returns ONE structured object. It gets no tools, no database
 * access and no way to write anything: the server turns the object into a reply after validating it.
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface JsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface StructuredRequest {
  system: string;
  messages: ChatMessage[];
  schemaName: string;
  schemaDescription: string;
  schema: JsonSchema;
  maxTokens: number;
}

export interface ChatProvider {
  readonly name: string;
  readonly model: string;
  isConfigured(): boolean;
  complete(req: StructuredRequest): Promise<unknown>;
}

/** The SDK loads only when a call is made, so a machine without it can still start the API. */
async function loadAnthropic(): Promise<any> {
  try {
    const mod: any = await import('@anthropic-ai/sdk');
    return mod.default?.default ?? mod.default ?? mod;
  } catch {
    throw new ProviderError('NOT_CONFIGURED', 'The AI SDK is not installed. Run npm install.');
  }
}

class AnthropicChat implements ChatProvider {
  readonly name = 'anthropic';
  readonly model = ENV.AI_MODEL || 'claude-sonnet-5-5';
  isConfigured() {
    return ENV.AI_PROVIDER === 'anthropic' && ENV.ANTHROPIC_API_KEY.length > 0;
  }
  async complete(req: StructuredRequest): Promise<unknown> {
    if (!this.isConfigured()) throw new ProviderError('NOT_CONFIGURED', 'The AI provider is not configured.');
    const Client = await loadAnthropic();
    const client = new Client({ apiKey: ENV.ANTHROPIC_API_KEY, timeout: ENV.AI_CHAT_TIMEOUT_MS, maxRetries: 1 });
    let message: any;
    try {
      message = await client.messages.create({
        model: this.model,
        max_tokens: req.maxTokens,
        system: req.system,
        tools: [{ name: req.schemaName, description: req.schemaDescription, input_schema: req.schema }],
        tool_choice: { type: 'tool', name: req.schemaName },
        messages: req.messages,
      });
    } catch (err: any) {
      const status = err?.status;
      if (status === 401 || status === 403) throw new ProviderError('AUTH', 'The AI provider rejected the credentials.');
      if (status === 429) throw new ProviderError('RATE_LIMIT', 'The AI provider is rate limiting requests.');
      if (status === 404) throw new ProviderError('MODEL_NOT_FOUND', 'The AI provider does not know this model.');
      if (status === 400) throw new ProviderError('BAD_REQUEST', 'The AI provider rejected the request.');
      if (err?.name === 'APIConnectionTimeoutError') throw new ProviderError('TIMEOUT', 'The AI provider timed out.');
      throw new ProviderError('PROVIDER_ERROR', 'The AI provider request failed.');
    }
    const block = message?.content?.find((b: any) => b.type === 'tool_use');
    if (!block) throw new ProviderError('INVALID_OUTPUT', 'The provider returned no structured result.');
    return block.input;
  }
}

/** Gemini's responseSchema wants upper-case type names; this converts the small JSON-schema subset used here. */
export function toGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const out: any = {};
  if (schema.type) out.type = String(schema.type).toUpperCase();
  if (schema.enum) out.enum = schema.enum;
  if (schema.description) out.description = schema.description;
  if (schema.properties) {
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
  }
  if (schema.items) out.items = toGeminiSchema(schema.items);
  if (schema.required) out.required = schema.required;
  return out;
}

class GeminiChat implements ChatProvider {
  readonly name = 'gemini';
  readonly model = ENV.AI_MODEL || 'gemini-flash-latest';
  isConfigured() {
    return ENV.AI_PROVIDER === 'gemini' && ENV.GEMINI_API_KEY.length > 0;
  }
  async complete(req: StructuredRequest): Promise<unknown> {
    if (!this.isConfigured()) throw new ProviderError('NOT_CONFIGURED', 'The AI provider is not configured.');
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { responseMimeType: 'application/json', responseSchema: toGeminiSchema(req.schema), maxOutputTokens: req.maxTokens, temperature: 0.2 },
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ENV.AI_CHAT_TIMEOUT_MS);
    let res: Response;
    try {
      // The key travels in a header, never in the URL.
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ENV.GEMINI_API_KEY },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      throw new ProviderError(err?.name === 'AbortError' ? 'TIMEOUT' : 'PROVIDER_ERROR', err?.name === 'AbortError' ? 'The AI provider timed out.' : 'The AI provider request failed.');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new ProviderError('AUTH', 'The AI provider rejected the credentials.');
      if (res.status === 429) throw new ProviderError('RATE_LIMIT', 'The AI provider is rate limiting requests.');
      if (res.status === 404) throw new ProviderError('MODEL_NOT_FOUND', 'The AI provider does not know this model.');
      if (res.status === 400) throw new ProviderError('BAD_REQUEST', 'The AI provider rejected the request.');
      throw new ProviderError('PROVIDER_ERROR', 'The AI provider request failed.');
    }
    try {
      const json: any = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? '';
      return JSON.parse(text);
    } catch {
      throw new ProviderError('INVALID_OUTPUT', 'The provider returned no structured result.');
    }
  }
}

/** The configured chat provider, or null when AI is off. Add a provider by implementing ChatProvider and selecting it here. */
export function getChatProvider(): ChatProvider | null {
  if (ENV.AI_PROVIDER === 'anthropic') return new AnthropicChat();
  if (ENV.AI_PROVIDER === 'gemini') return new GeminiChat();
  return null;
}

export function chatStatus() {
  const p = getChatProvider();
  const configured = !!p?.isConfigured();
  return { configured, provider: configured ? p!.name : null, model: configured ? p!.model : null };
}
