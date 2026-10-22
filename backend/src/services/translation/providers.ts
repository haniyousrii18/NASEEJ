import { localProvider } from './localEngine.js';
import { registerTranslationProvider } from './provider.js';

/**
 * Approved NON-AI translation providers. Set TRANSLATION_PROVIDER to a provider's name to turn translation on.
 *
 *   local   the medical glossary + a local machine-translation model (see localEngine.ts)
 *
 * To add another: implement TranslationProvider (ai: false) and register it here. A language model or a third-party service
 * holding an API key is not allowed for this feature. See provider.ts.
 */
export function registerBuiltInProviders(): void {
  registerTranslationProvider(localProvider);
}
