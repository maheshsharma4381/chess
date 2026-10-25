import { createMemoryCache, createProxyState, handleExplorerRequest } from '@chess/explorer-proxy';
import { serverSecret } from '@/lib/server/env';

// Standalone fallback (no SERVER_URL): one cache and one upstream queue per Next process.
// With SERVER_URL set, next.config rewrites this path to apps/server and its Redis cache.
const cache = createMemoryCache();
const state = createProxyState();

export async function GET(request: Request, { params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  return handleExplorerRequest(source, new URL(request.url), {
    fetchFn: (url, init) => fetch(url, init),
    token: serverSecret('LICHESS_API_TOKEN'),
    cache,
    state,
  });
}
