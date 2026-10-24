import { loadEnvConfig } from '@next/env';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// Secrets (e.g. LICHESS_API_TOKEN for the explorer proxy) live in the monorepo root .env.
// Only NEXT_PUBLIC_* variables ever reach the browser bundle.
loadEnvConfig(fileURLToPath(new URL('../../', import.meta.url)));

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@chess/bots', '@chess/chess-core', '@chess/engine', '@chess/types'],
  async headers() {
    return [
      {
        // Stockfish WASM must be served with its MIME type; keep it cacheable.
        source: '/engine/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default config;
