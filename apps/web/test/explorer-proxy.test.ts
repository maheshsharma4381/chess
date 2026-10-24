import { describe, expect, it } from 'vitest';
import { createExplorerCache, handleExplorerRequest } from '@/lib/explorer/proxy';

const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const TOKEN = 'lip_secret_token_123';
const BODY = { white: 1, draws: 1, black: 1, moves: [], topGames: [], opening: null };

function fakeFetch(status = 200, body: unknown = BODY) {
  const calls: Array<{ url: string; auth: string | null }> = [];
  const fetchFn = async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, auth: init?.headers?.['Authorization'] ?? null });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetchFn, calls };
}

const req = (source: string, query: string) => ({
  source,
  url: new URL(`http://localhost/api/opening-explorer/${source}?${query}`),
});

describe('explorer proxy', () => {
  it('forwards a valid query with the bearer token and caches the answer', async () => {
    const { fetchFn, calls } = fakeFetch();
    const cache = createExplorerCache();
    const q = req('lichess', `fen=${encodeURIComponent(FEN)}&ratings=1600,1800&speeds=blitz`);
    const first = await handleExplorerRequest(q.source, q.url, { fetchFn, token: TOKEN, cache });
    const second = await handleExplorerRequest(q.source, q.url, { fetchFn, token: TOKEN, cache });
    expect(first.status).toBe(200);
    expect(await second.json()).toEqual(BODY);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.auth).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]?.url).toContain('https://explorer.lichess.ovh/lichess?fen=');
    expect(calls[0]?.url).toContain('ratings=1600,1800');
    expect(calls[0]?.url).toContain('speeds=blitz');
  });

  it('expires cached answers after the TTL', async () => {
    const { fetchFn, calls } = fakeFetch();
    let now = 0;
    const cache = createExplorerCache({ ttlMs: 1000, now: () => now });
    const q = req('masters', `fen=${encodeURIComponent(FEN)}`);
    await handleExplorerRequest(q.source, q.url, { fetchFn, token: TOKEN, cache });
    now = 2000;
    await handleExplorerRequest(q.source, q.url, { fetchFn, token: TOKEN, cache });
    expect(calls).toHaveLength(2);
  });

  it.each([
    ['an unknown source', 'players', `fen=${encodeURIComponent(FEN)}`],
    ['a missing FEN', 'masters', ''],
    ['an invalid FEN', 'masters', 'fen=not-a-fen'],
    ['an unknown speed', 'lichess', `fen=${encodeURIComponent(FEN)}&speeds=turbo`],
    ['an unknown rating bracket', 'lichess', `fen=${encodeURIComponent(FEN)}&ratings=1650`],
  ])('rejects %s with 400', async (_, source, query) => {
    const { fetchFn, calls } = fakeFetch();
    const q = req(source, query);
    const res = await handleExplorerRequest(q.source, q.url, {
      fetchFn,
      token: TOKEN,
      cache: createExplorerCache(),
    });
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('reports a missing token as a configuration error', async () => {
    const { fetchFn } = fakeFetch();
    const q = req('masters', `fen=${encodeURIComponent(FEN)}`);
    const res = await handleExplorerRequest(q.source, q.url, {
      fetchFn,
      token: undefined,
      cache: createExplorerCache(),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Explorer not configured' });
  });

  it('passes Lichess rate limits through without caching them or leaking the token', async () => {
    const { fetchFn, calls } = fakeFetch(429, { error: 'slow down' });
    const cache = createExplorerCache();
    const q = req('masters', `fen=${encodeURIComponent(FEN)}`);
    const res = await handleExplorerRequest(q.source, q.url, { fetchFn, token: TOKEN, cache });
    expect(res.status).toBe(429);
    const text = await res.text();
    expect(text).not.toContain(TOKEN);
    await handleExplorerRequest(q.source, q.url, { fetchFn, token: TOKEN, cache });
    expect(calls).toHaveLength(2);
  });

  it('turns network failures into 502', async () => {
    const q = req('masters', `fen=${encodeURIComponent(FEN)}`);
    const res = await handleExplorerRequest(q.source, q.url, {
      fetchFn: async () => {
        throw new TypeError('fetch failed');
      },
      token: TOKEN,
      cache: createExplorerCache(),
    });
    expect(res.status).toBe(502);
  });
});
