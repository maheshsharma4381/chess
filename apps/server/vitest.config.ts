import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/helpers/globalSetup.ts'],
    // Each file boots its own PGlite (a WASM Postgres); one at a time keeps memory in check on
    // small machines, where two at once could stall past the hook timeout.
    maxWorkers: 1,
    // PGlite boots a WASM Postgres per file (several seconds on a cold, busy machine).
    hookTimeout: 300_000,
  },
});
