import path from 'path';

/** The local engine's models: OPUS-MT (Helsinki-NLP) Marian translators converted to ONNX, one per direction. */
export const MODELS = { 'ar-en': 'Xenova/opus-mt-ar-en', 'en-ar': 'Xenova/opus-mt-en-ar' } as const;
export type Direction = keyof typeof MODELS;

/** Where `npm run translate:models` puts them. Not committed (see .gitignore). */
export const MODEL_DIR = path.resolve(process.cwd(), process.env.TRANSLATION_MODEL_DIR || 'models/translation');
