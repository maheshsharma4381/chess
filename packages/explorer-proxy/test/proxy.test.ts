import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  createMemoryCache,
  createProxyState,
  createRedisCache,
  handleExplorerRequest,
  type ProxyDeps,
} from '../src/index';

const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const TOKEN = 'lip_secret_token_123';
const BODY = { white: 1, draws: 1, black: 1, moves: [], topGames: [], opening: null };
const MIN = 60_000;

function fakeFetch(
  reply: () => { status: number; body?: unknown } = () => ({ status: 200, body: BODY }),
) {
  const calls: Array<{ url: string; auth: string | null }> = [];
  let release: (() => void) | null = null;
  const fetchFn = async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, auth: init?.headers?.['Authorization'] ?? null });
    if (gate) await gate;
    const { status, body } = reply();
    return new Response(JSON.stringify(body ?? BODY), { status });
  };
  let gate: Promise<void> | null = null;
  return {
    fetchFn,
    calls,
    hold: () => {
      gate = new Promise((r) => (release = r));
    },
    release: () => {
      gate = null;
      release?.();
    },
  };
}

const url = (source: string, query: string) =>
  new URL(`http://localhost/api/opening-explorer/${source}?${query}`);
const masters = url('masters', `fen=${encodeURIComponent(FEN)}`);

function setup(overrides: Partial<ProxyDeps> = {}) {
  let now = 1_000_000;
  const f = fakeFetch();
  const deps: ProxyDeps = {
    fetchFn: f.fetchFn,
    token: TOKEN,
    cache: createMemoryCache({ now: () => now }),
    state: createProxyState(),
    now: () => now,
    ...overrides,
  };
  return { deps, f, advance: (ms: number) => (now += ms) };
}

describe('explorer proxy', () => {
  it('forwards a valid query with the bearer token and caches the answer', async () => {
    const { deps, f } = setup();
    const q = url('lichess', `fen=${encodeURIComponent(FEN)}&ratings=1600,1800&speeds=blitz`);
    const first = await handleExplorerRequest('lichess', q, deps);
    const second = await handleExplorerRequest('lichess', q, deps);
    expect(first.status).toBe(200);
    expect(first.headers.get('X-Cache')).toBe('miss');
    expect(second.headers.get('X-Cache')).toBe('hit');
    expect(await second.json()).toEqual(BODY);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.auth).toBe(`Bearer ${TOKEN}`);
    expect(f.calls[0]?.url).toContain('https://explorer.lichess.ovh/lichess?fen=');
    expect(f.calls[0]?.url).toContain('ratings=1600,1800');
    expect(f.calls[0]?.url).toContain('speeds=blitz');
  });

  it.each([
    ['an unknown source', 'players', `fen=${encodeURIComponent(FEN)}`],
    ['a missing FEN', 'masters', ''],
    ['an invalid FEN', 'masters', 'fen=not-a-fen'],
    ['an unknown speed', 'lichess', `fen=${encodeURIComponent(FEN)}&speeds=turbo`],
    ['an unknown rating bracket', 'lichess', `fen=${encodeURIComponent(FEN)}&ratings=1650`],
  ])('rejects %s with 400', async (_, source, query) => {
    const { deps, f } = setup();
    const res = await handleExplorerRequest(source, url(source, query), deps);
    expect(res.status).toBe(400);
    expect(f.calls).toHaveLength(0);
  });

  it('reports a missing token as a configuration error', async () => {
    const { deps } = setup({ token: undefined });
    const res = await handleExplorerRequest('masters', masters, deps);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Explorer not configured' });
  });

  it('turns network failures into 502', async () => {
    const { deps } = setup({
      fetchFn: async () => {
        throw new TypeError('fetch failed');
      },
    });
    expect((await handleExplorerRequest('masters', masters, deps)).status).toBe(502);
  });

  it('serves a stale answer at once and refreshes it once, however many ask', async () => {
    const { deps, f, advance } = setup();
    await handleExplorerRequest('masters', masters, deps);
    advance(11 * MIN);
    f.hold();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => handleExplorerRequest('masters', masters, deps)),
    );
    expect(responses.map((r) => r.headers.get('X-Cache'))).toEqual(Array(5).fill('stale'));
    f.release();
    await deps.state!.settled();
    expect(f.calls).toHaveLength(2);
    expect((await handleExplorerRequest('masters', masters, deps)).headers.get('X-Cache')).toBe(
      'hit',
    );
  });

  it('refetches entries older than a day', async () => {
    const { deps, f, advance } = setup();
    await handleExplorerRequest('masters', masters, deps);
    advance(25 * 60 * MIN);
    const res = await handleExplorerRequest('masters', masters, deps);
    expect(res.headers.get('X-Cache')).toBe('miss');
    expect(f.calls).toHaveLength(2);
  });

  it('shares one upstream request between concurrent misses', async () => {
    const { deps, f } = setup();
    f.hold();
    const pending = Promise.all(
      [1, 2, 3].map(() => handleExplorerRequest('masters', masters, deps)),
    );
    await new Promise((r) => setTimeout(r, 10));
    f.release();
    const results = await pending;
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(f.calls).toHaveLength(1);
  });

  it('keeps at most one upstream request in flight across positions', async () => {
    let inFlight = 0;
    let peak = 0;
    const { deps } = setup({
      fetchFn: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 15));
        inFlight--;
        return new Response(JSON.stringify(BODY), { status: 200 });
      },
    });
    const fens = ['e4', 'd4', 'c4'].map((san) => new Chess().move(san).after);
    const results = await Promise.all(
      fens.map((fen) =>
        handleExplorerRequest('masters', url('masters', `fen=${encodeURIComponent(fen)}`), deps),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(peak).toBe(1);
  });

  it('backs off for 60s after Lichess answers 429, serving stale data meanwhile', async () => {
    let status = 200;
    const f = fakeFetch(() => ({ status, body: status === 429 ? { error: 'slow down' } : BODY }));
    const { deps, advance } = setup({ fetchFn: f.fetchFn });
    const other = url(
      'masters',
      `fen=${encodeURIComponent('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1')}`,
    );

    await handleExplorerRequest('masters', masters, deps);
    // The cached position goes stale, then Lichess starts refusing.
    advance(10 * MIN + 1000);
    status = 429;
    const limited = await handleExplorerRequest('masters', other, deps);
    expect(limited.status).toBe(429);
    expect(await limited.text()).not.toContain(TOKEN);
    expect(Number(limited.headers.get('Retry-After'))).toBe(60);
    expect(f.calls).toHaveLength(2);

    // Within the 60s back-off: no upstream call, and stale data is still served.
    advance(30_000);
    const again = await handleExplorerRequest('masters', other, deps);
    expect(again.status).toBe(429);
    expect(Number(again.headers.get('Retry-After'))).toBe(30);
    const stale = await handleExplorerRequest('masters', masters, deps);
    expect(stale.status).toBe(200);
    expect(stale.headers.get('X-Cache')).toBe('stale');
    await deps.state!.settled();
    expect(f.calls).toHaveLength(2);

    advance(31_000);
    status = 200;
    expect((await handleExplorerRequest('masters', other, deps)).status).toBe(200);
    expect(f.calls).toHaveLength(3);
  });

  it('passes other upstream errors through without caching them', async () => {
    const f = fakeFetch(() => ({ status: 503, body: { error: 'down' } }));
    const { deps } = setup({ fetchFn: f.fetchFn });
    expect((await handleExplorerRequest('masters', masters, deps)).status).toBe(503);
    expect((await handleExplorerRequest('masters', masters, deps)).status).toBe(503);
    expect(f.calls).toHaveLength(2);
  });
});

describe('caches', () => {
  it('memory cache evicts the least recently used entry', async () => {
    const cache = createMemoryCache({ max: 2, now: () => 1 });
    await cache.set('a', { body: 'A', fetchedAt: 1 });
    await cache.set('b', { body: 'B', fetchedAt: 1 });
    await cache.get('a');
    await cache.set('c', { body: 'C', fetchedAt: 1 });
    expect(await cache.get('b')).toBeNull();
    expect((await cache.get('a'))?.body).toBe('A');
  });

  it('redis cache stores JSON entries with a TTL under its prefix', async () => {
    const store = new Map<string, { value: string; ttl: number }>();
    const redis = {
      get: async (k: string) => store.get(k)?.value ?? null,
      set: async (k: string, v: string, _ex: 'EX', ttl: number) => {
        store.set(k, { value: v, ttl });
        return 'OK';
      },
    };
    const cache = createRedisCache(redis, { prefix: 'p:', maxAgeSec: 86_400 });
    await cache.set('key', { body: '{"x":1}', fetchedAt: 42 });
    expect(store.get('p:explorer:key')).toEqual({
      value: JSON.stringify({ body: '{"x":1}', fetchedAt: 42 }),
      ttl: 86_400,
    });
    expect(await cache.get('key')).toEqual({ body: '{"x":1}', fetchedAt: 42 });
    store.set('p:explorer:bad', { value: 'not json', ttl: 1 });
    expect(await cache.get('bad')).toBeNull();
  });
});
