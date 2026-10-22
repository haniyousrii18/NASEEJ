import fs from 'fs';
import path from 'path';
import { glossaryTranslate } from './glossary/engine.js';
import { MODEL_DIR, MODELS, type Direction } from './models.js';
import { MIN_RECALL, plausible, recall } from './quality.js';
import type { Lang, TranslationOutput, TranslationProvider } from './provider.js';

/**
 * Naseej's built-in, fully local translation engine. No AI assistant, no LLM, no network at run time, no API key.
 *  1. The medical glossary (exact, deterministic, reviewable): used whenever it understands every word.
 *  2. A local OPUS-MT neural machine-translation model (Marian, ONNX, run on this server by @huggingface/transformers),
 *     for everything else. Its output is accepted only if it passes the round-trip quality gate in quality.ts and keeps the
 *     numbers. It is always labelled as automatic translation, because it can still be wrong.
 * If models are not installed (`npm run translate:models`), only the glossary runs.
 */
const modelPresent = (direction: Direction) => fs.existsSync(path.join(MODEL_DIR, MODELS[direction], 'onnx'));

type Pipe = (text: string, opts?: Record<string, unknown>) => Promise<Array<{ translation_text: string }>>;
const pipes = new Map<Direction, Promise<Pipe>>();

async function load(direction: Direction): Promise<Pipe> {
  let p = pipes.get(direction);
  if (!p) {
    p = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = MODEL_DIR;
      env.allowRemoteModels = false; // run-time translation never touches the network
      return (await pipeline('translation', MODELS[direction], { dtype: 'q8' } as any)) as unknown as Pipe;
    })();
    p.catch(() => pipes.delete(direction));
    pipes.set(direction, p);
  }
  return p;
}

// One inference at a time: the runtime is CPU-bound, and a queue keeps a burst of requests from exhausting memory.
let chain: Promise<unknown> = Promise.resolve();
const TIMEOUT_MS = 30_000;

function raw(text: string, direction: Direction): Promise<string | null> {
  const run = async (): Promise<string | null> => {
    const pipe = await load(direction);
    const work = pipe(text, { max_new_tokens: Math.min(160, Math.max(24, text.length * 2)), num_beams: 4 });
    const out = await Promise.race([work, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS))]);
    return out?.[0]?.translation_text?.trim() || null;
  };
  const next = chain.then(run, run);
  chain = next.catch(() => undefined);
  return next.catch(() => null);
}

/** Machine translation of one text, kept only if it is plausible and survives the round trip. Exported for tests. */
export async function machineTranslate(text: string, source: Lang, target: Lang, translateRaw = raw): Promise<string | null> {
  const direction = `${source}-${target}` as Direction;
  const out = await translateRaw(text, direction);
  if (!out || !plausible(text, out, target)) return null;
  const back = await translateRaw(out, `${target}-${source}` as Direction);
  if (!back || recall(text, back, source) < MIN_RECALL) return null;
  return out;
}

export const localProvider: TranslationProvider = {
  name: 'local',
  ai: false,
  isConfigured: () => true, // the glossary alone is always available
  async translate(texts, source, target): Promise<TranslationOutput[]> {
    const mt = process.env.TRANSLATION_MT !== 'off' && modelPresent(`${source}-${target}` as Direction) && modelPresent(`${target}-${source}` as Direction);
    const results: TranslationOutput[] = [];
    for (const text of texts) {
      const exact = glossaryTranslate(text, target);
      if (exact) {
        results.push({ text: exact, engine: 'glossary' });
        continue;
      }
      const machine = mt ? await machineTranslate(text, source, target) : null;
      results.push(machine ? { text: machine, engine: 'local-mt' } : null);
    }
    return results;
  },
};
