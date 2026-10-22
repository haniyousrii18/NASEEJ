/**
 * The boundary between Naseej and an automatic translation engine.
 *
 * Translating typed text is NOT an AI feature in Naseej: the assistant, the document reader and every other model-backed
 * feature are off-limits for it. A provider here must be a non-AI engine (a rule-based or dictionary translator, or a
 * machine-translation engine the organisation runs itself and has approved). The type below makes that explicit:
 * `ai: false` is the only value that compiles, so a language-model client cannot be registered by accident.
 *
 * The project ships one provider, `local` (localEngine.ts): an exact medical glossary plus a local machine-translation model
 * that runs on this server. With TRANSLATION_PROVIDER empty, or an unknown name, nothing is translated and the product shows
 * what people wrote with a clear "no translation available" note. It never pretends text was translated.
 */
export type Lang = 'ar' | 'en';

/** One translated text, optionally naming the engine that made it (stored with it and shown to the reader). */
export type TranslationOutput = string | { text: string; engine: string } | null;

export interface TranslationProvider {
  /** Short identifier stored with every translation it makes, e.g. "local-engine". */
  readonly name: string;
  /** Always false. Only non-AI engines may be registered. */
  readonly ai: false;
  /** True only when everything the engine needs (a model file, a service address) is present. */
  isConfigured(): boolean;
  /**
   * Translates each text from `source` to `target`. Return one entry per input, in order. Return null for any text the engine
   * cannot translate faithfully: Naseej then shows the original and says no translation is available. Never return a guess.
   */
  translate(texts: string[], source: Lang, target: Lang): Promise<TranslationOutput[]>;
}

const registry = new Map<string, TranslationProvider>();

/** Adds an approved non-AI provider. Called from providers.ts (and from tests). */
export function registerTranslationProvider(provider: TranslationProvider): void {
  registry.set(provider.name.toLowerCase(), provider);
}

export function unregisterTranslationProvider(name: string): void {
  registry.delete(name.toLowerCase());
}

/** The provider named by `name` (TRANSLATION_PROVIDER), or null when translation is off or the name is unknown or unconfigured. */
export function getTranslationProvider(name: string): TranslationProvider | null {
  const p = name ? registry.get(name.toLowerCase()) : undefined;
  return p && p.isConfigured() ? p : null;
}
