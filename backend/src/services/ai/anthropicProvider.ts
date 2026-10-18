import type Anthropic from '@anthropic-ai/sdk';
import { ENV } from '../../config/env.js';
import { SYSTEM } from './prompt.js';
import { sanitizeAnalysis } from './sanitize.js';
import { AnalyzeInput, DOCUMENT_TYPES, DocumentAnalysis, DocumentAnalysisProvider, FACT_KINDS, ProviderError } from './types.js';

/**
 * Document analysis through the Anthropic Messages API (PDF and image input, structured output through a forced tool call).
 * The API key is read from the environment on the server only. A file leaves this server for api.anthropic.com
 * only when it was allowed for that document (see documentReviewRoutes).
 */
const TOOL = {
  name: 'record_document_analysis',
  description: 'Record the classification and the candidate facts read from the document.',
  input_schema: {
    type: 'object' as const,
    properties: {
      document_type: { type: 'string', enum: [...DOCUMENT_TYPES] },
      document_type_confidence: { type: 'number', minimum: 0, maximum: 1 },
      page_count: { type: 'integer', minimum: 1 },
      facts: {
        type: 'array',
        maxItems: 60,
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: [...FACT_KINDS] },
            label: { type: 'string', description: 'The item as written, e.g. a test name, medication or condition.' },
            value: { type: 'string' },
            unit: { type: 'string' },
            date: { type: 'string', description: 'YYYY-MM-DD' },
            page: { type: 'integer', minimum: 1 },
            passage: { type: 'string', description: 'Exact short passage the item was read from.' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            why: { type: 'string' },
          },
          required: ['kind', 'label', 'page', 'passage'],
        },
      },
    },
    required: ['document_type', 'facts'],
  },
};

/**
 * The SDK is loaded only when a document is actually analyzed. AI is optional and off by default, so a machine that
 * has not run `npm install` since the SDK was added must still be able to start the API.
 */
async function loadSdk(): Promise<typeof Anthropic> {
  try {
    const mod: any = await import('@anthropic-ai/sdk');
    return mod.default?.default ?? mod.default ?? mod;
  } catch {
    throw new ProviderError('NOT_CONFIGURED', 'The AI SDK is not installed. Run npm install.');
  }
}

export class AnthropicProvider implements DocumentAnalysisProvider {
  readonly name = 'anthropic';
  readonly model = ENV.AI_MODEL || 'claude-sonnet-5-5';

  isConfigured(): boolean {
    return ENV.AI_PROVIDER === 'anthropic' && ENV.ANTHROPIC_API_KEY.length > 0;
  }

  async analyze({ buffer, mimeType }: AnalyzeInput): Promise<DocumentAnalysis> {
    if (!this.isConfigured()) throw new ProviderError('NOT_CONFIGURED', 'The AI provider is not configured.');
    const AnthropicClient = await loadSdk();
    const client = new AnthropicClient({ apiKey: ENV.ANTHROPIC_API_KEY, timeout: ENV.AI_TIMEOUT_MS, maxRetries: 1 });
    const data = buffer.toString('base64');
    const source =
      mimeType === 'application/pdf'
        ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } as const)
        : ({ type: 'image', source: { type: 'base64', media_type: mimeType, data } } as const);

    let message;
    try {
      message = await client.messages.create({
        model: this.model,
        max_tokens: 8000,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: TOOL.name },
        messages: [{ role: 'user', content: [source, { type: 'text', text: 'Analyze this document and record the result with the tool.' }] }],
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

    const block = message.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') throw new ProviderError('INVALID_OUTPUT', 'The provider returned no structured result.');
    return { ...sanitizeAnalysis(block.input), model: message.model || this.model };
  }
}
