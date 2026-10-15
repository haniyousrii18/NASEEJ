import { defineConfig } from 'vitest/config';

// The API tests share one seeded PostgreSQL database and some of them change state (consents, cases, documents),
// so test files run one after another rather than in parallel workers.
export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
