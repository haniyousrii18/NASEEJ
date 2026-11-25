import fs from 'fs';
import path from 'path';
import { glossaryTranslate } from './glossary/engine.js';
import { MODEL_DIR, MODELS, type Direction } from './models.js';
import { plausible } from './quality.js';
import { termsVerified } from './verify.js';
import type { Lang, TranslationOutput, TranslationProvider } from './provider.js';

/**
 * Marja's built-in, fully local translation engine. No AI assistant, no LLM, no network at run time, no API key.
 *  1. The medical glossary (exact, deterministic, reviewable): used whenever it understands every word.
 *  2. A local OPUS-MT neural machine-translation model (Marian, ONNX, run on this server by @huggingface/transformers),
 *     for everything else. Its output is accepted only if it passes the round-trip quality gate in quality.ts and keeps the
 *     numbers. It is always labelled as automatic translation, because it can still be wrong.
 * If models are not installed (`npm run translate:models`), only the glossary runs.
 */
/** Where a text splits into clauses: sentence ends, commas, semicolons, line breaks (the separator is kept). */
const CLAUSE = /(\s*[.!?؟]\s+|\s*[,،;؛]\s*|\n+)/;

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

/**
 * Machine translation of one text, kept only if it is plausible and its vocabulary checks out: every concept of the
 * original is in the reviewed vocabulary and appears in the output with a reviewed rendering, and nothing is added
 * (verify.ts). That check is stricter than a round trip, which also rejected correct sentences because the
 * back-translation was noisy ("لتغيير" for "تغيير"). Exported for tests.
 */
export async function machineTranslate(text: string, source: Lang, target: Lang, translateRaw = raw): Promise<string | null> {
  const direction = `${source}-${target}` as Direction;
  const out = await translateRaw(text, direction);
  if (!out || !plausible(text, out, target)) return null;
  if (!termsVerified(text, out, source, target)) return null;
  return out;
}

export const localProvider: TranslationProvider = {
  name: 'local',
  ai: false,
  isConfigured: () => true, // the glossary alone is always available
  async translate(texts, source, target): Promise<TranslationOutput[]> {
    const mt = process.env.TRANSLATION_MT !== 'off' && modelPresent(`${source}-${target}` as Direction) && modelPresent(`${target}-${source}` as Direction);
    const results: TranslationOutput[] = [];
    const one = async (text: string): Promise<{ text: string; engine: string } | null> => {
      const exact = glossaryTranslate(text, target);
      if (exact) return { text: exact, engine: 'glossary' };
      const machine = mt ? await machineTranslate(text, source, target) : null;
      return machine ? { text: machine, engine: 'local-mt' } : null;
    };
    for (const text of texts) {
      const whole = await one(text);
      if (whole) {
        results.push(whole);
        continue;
      }
      // Clause by clause: every clause must translate with confidence, or the whole text stays as written.
      const parts = text.split(CLAUSE);
      if (parts.length < 3) {
        results.push(null);
        continue;
      }
      let ok = true;
      const engines = new Set<string>();
      const built: string[] = [];
      for (let k = 0; k < parts.length && ok; k++) {
        const piece = parts[k];
        if (k % 2 === 1) {
          built.push(target === 'ar' ? piece.replace(/,/g, '،').replace(/;/g, '؛').replace(/\?/g, '؟') : piece.replace(/،/g, ',').replace(/؛/g, ';').replace(/؟/g, '?'));
          continue;
        }
        if (!piece.trim()) {
          built.push(piece);
          continue;
        }
        const r = await one(piece.trim());
        if (!r) ok = false;
        else {
          engines.add(r.engine);
          built.push(r.text);
        }
      }
      results.push(ok ? { text: built.join('').replace(/\s+([,،;؛.?؟!])/g, '$1').trim(), engine: engines.has('local-mt') ? 'local-mt' : 'glossary' } : null);
    }
    return results;
  },
};
