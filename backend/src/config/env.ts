import dotenv from 'dotenv';
import path from 'path';

// Try .env in cwd (= project root when called via `npm --prefix backend run`)
// Then try ../.env  (= project root when called directly from backend/)
const r1 = dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const r2 = dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config(); // fallback

// Temporary debug — remove after confirming connection works
console.log('[env] cwd:', process.cwd());
console.log('[env] r1 loaded:', !r1.error, '| r2 loaded:', !r2.error);
console.log('[env] DB_PASSWORD length:', (process.env.DB_PASSWORD || '').length, '| DB_USER:', process.env.DB_USER);

export const ENV = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
  DB_NAME: process.env.DB_NAME || 'naseej_dev',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_SSL: process.env.DB_SSL === 'true',
  JWT_SECRET: process.env.JWT_SECRET || 'naseej_academic_prototype_jwt_secret_key_2026_secure',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  STORAGE_DIR: process.env.STORAGE_DIR || path.resolve(process.cwd(), '../storage/protected'),
  // Optional AI document analysis. Off unless AI_PROVIDER and the matching key are set. Never commit a real key.
  AI_PROVIDER: (process.env.AI_PROVIDER || '').toLowerCase(),
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  // Empty means each provider uses its own default model.
  AI_MODEL: process.env.AI_MODEL || '',
  AI_TIMEOUT_MS: parseInt(process.env.AI_TIMEOUT_MS || '120000', 10),
};
