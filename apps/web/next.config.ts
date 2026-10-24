import type { NextConfig } from 'next';

// Server secrets (e.g. LICHESS_API_TOKEN) are read from the repo-root .env by lib/server/env.ts.

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
