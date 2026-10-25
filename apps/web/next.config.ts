import type { NextConfig } from 'next';
import { serverSecret } from './lib/server/dotenv';

// Server secrets (e.g. LICHESS_API_TOKEN) are read from the repo-root .env by lib/server/env.ts.

/**
 * Where apps/server listens. Read when Next builds its routes manifest, so set it before
 * `next build`. Unset: no accounts, and the explorer uses the web app's own route.
 */
const serverUrl = serverSecret('SERVER_URL')?.replace(/\/$/, '');

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    '@chess/bots',
    '@chess/chess-core',
    '@chess/engine',
    '@chess/explorer-proxy',
    '@chess/types',
  ],
  async headers() {
    return [
      {
        // Stockfish WASM must be served with its MIME type; keep it cacheable.
        source: '/engine/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
  async rewrites() {
    if (!serverUrl) return [];
    return {
      // Before the filesystem, so the server's Redis-cached explorer wins over the local route.
      beforeFiles: [
        {
          source: '/api/opening-explorer/:source',
          destination: `${serverUrl}/api/opening-explorer/:source`,
        },
      ],
      // Same-origin API: auth cookies stay first-party and the server needs no CORS.
      afterFiles: [{ source: '/api/v1/:path*', destination: `${serverUrl}/api/:path*` }],
      fallback: [],
    };
  },
};

export default config;
