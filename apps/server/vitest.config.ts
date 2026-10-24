import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/helpers/globalSetup.ts'],
    // PGlite and Redis are per file; a few files at once keeps memory in check.
    maxWorkers: 2,
    // PGlite boots a WASM Postgres per file (several seconds on a cold, busy machine).
    hookTimeout: 120_000,
  },
});
