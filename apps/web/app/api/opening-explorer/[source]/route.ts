import { createExplorerCache, handleExplorerRequest } from '@/lib/explorer/proxy';

// One cache per server process; Phase 4's server moves this to Redis.
const cache = createExplorerCache();

export async function GET(request: Request, { params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  return handleExplorerRequest(source, new URL(request.url), {
    fetchFn: (url, init) => fetch(url, init),
    token: process.env['LICHESS_API_TOKEN'],
    cache,
  });
}
