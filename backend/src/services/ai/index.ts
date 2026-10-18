import { ENV } from '../../config/env.js';
import { AnthropicProvider } from './anthropicProvider.js';
import { DocumentAnalysisProvider } from './types.js';

/**
 * The configured provider, or null when AI processing is off. To add another provider, implement
 * DocumentAnalysisProvider and select it here by AI_PROVIDER; the document workflow does not change.
 */
export function getProvider(): DocumentAnalysisProvider | null {
  if (ENV.AI_PROVIDER === 'anthropic') return new AnthropicProvider();
  return null;
}

export function aiStatus() {
  const provider = getProvider();
  const configured = !!provider?.isConfigured();
  return {
    configured,
    provider: configured ? provider!.name : null,
    model: configured ? provider!.model : null,
    // Where the file goes when processing runs. 'external_provider' = it is sent to a third-party API.
    dataHandling: configured ? ('external_provider' as const) : ('none' as const),
  };
}
