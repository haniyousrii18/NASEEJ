import { defineConfig } from 'vitest/config';

// The API tests share one seeded PostgreSQL database and some of them change state (documents, shares, entries),
// so test files run one after another rather than in parallel workers.
export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    // The suite logs in as staff accounts created by tests/setup.ts, which patient-only mode would reject.
    // Email is always off in the tests too (they use the in-memory outbox), so a configured SMTP account in .env is never used.
    // AI is always off in the tests, whatever the local .env says, so the "not connected" behaviour is what gets checked.
    env: { PATIENT_ONLY_MODE: 'false', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', TRANSLATION_PROVIDER: '', AI_PROVIDER: '', GEMINI_API_KEY: '', ANTHROPIC_API_KEY: '' },
    setupFiles: ['tests/setup.ts'],
  },
});
