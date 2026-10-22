import path from 'path';
import { MODELS, MODEL_DIR } from '../src/services/translation/models.js';

/**
 * One-time download of the local translation models (OPUS-MT, MarianMT, ONNX). After this the API translates with no network
 * and no key: at run time remote models are switched off. Re-running skips what is already on disk.
 *   npm run translate:models
 */
async function main() {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = MODEL_DIR;
  env.allowRemoteModels = true;
  for (const [direction, model] of Object.entries(MODELS)) {
    console.log(`[Translation] ${direction}: fetching ${model} into ${path.relative(process.cwd(), MODEL_DIR)} ...`);
    const t: any = await pipeline('translation', model, { dtype: 'q8' } as any);
    const probe = await t(direction === 'ar-en' ? 'ألم في الصدر' : 'Chest pain', { max_new_tokens: 40 });
    console.log(`[Translation] ${direction}: ready. Sample -> ${probe?.[0]?.translation_text}`);
    await t.dispose?.();
  }
}

main().catch((err) => {
  console.error('[Translation] model download failed:', err?.message ?? err);
  process.exit(1);
});
