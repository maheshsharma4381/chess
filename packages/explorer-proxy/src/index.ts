import { Chess } from 'chess.js';

/**
 * Server-side proxy to the Lichess opening explorer, shared by the web app's route handler
 * and apps/server. The explorer needs a personal token, which must never reach the browser.
 * Opening statistics barely move and Lichess rate-limits, so answers are cached: fresh for
 * 10 minutes, then served stale for up to a day while one refresh runs. At most one upstream
 * request is in flight, and an upstream 429 pauses all upstream calls for 60 seconds.
 */

const UPSTREAM = 'https://explorer.lichess.ovh';
const SOURCES = new Set(['masters', 'lichess']);
const RATINGS = new Set(['0', '1000', '1200', '1400', '1600', '1800', '2000', '2200', '2500']);
const SPEEDS = new Set(['ultraBullet', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence']);
const UPSTREAM_TIMEOUT_MS = 10_000;
export const FRESH_MS = 10 * 60_000;
export const STALE_MS = 24 * 3600_000;
export const BACKOFF_MS = 60_000;

export interface CacheEntry {
  body: string;
  /** Epoch ms of the upstream answer. */
  fetchedAt: number;
}

export interface ExplorerCache {
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, entry: CacheEntry): Promise<void>;
}

/** In-process LRU (Map keeps insertion order; a hit re-inserts the key). */
export function createMemoryCache(
  opts: { max?: number; maxAgeMs?: number; now?: () => number } = {},
): ExplorerCache {
  const { max = 500, maxAgeMs = STALE_MS, now = Date.now } = opts;
  const entries = new Map<string, CacheEntry>();
  return {
    async get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      entries.delete(key);
      if (now() - entry.fetchedAt > maxAgeMs) return null;
      entries.set(key, entry);
      return entry;
    },
    async set(key, entry) {
      entries.delete(key);
      entries.set(key, entry);
      if (entries.size > max) entries.delete(entries.keys().next().value as string);
    },
  };
}

/** The slice of an ioredis client the Redis cache uses. */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
}

/** Shared by every server instance; Redis drops entries after the stale window. */
export function createRedisCache(
  redis: RedisLike,
  opts: { prefix: string; maxAgeSec?: number },
): ExplorerCache {
  const ttl = opts.maxAgeSec ?? STALE_MS / 1000;
  const k = (key: string) => `${opts.prefix}explorer:${key}`;
  return {
    async get(key) {
      const raw = await redis.get(k(key));
      if (!raw) return null;
      try {
        const entry = JSON.parse(raw) as CacheEntry;
        return typeof entry.body === 'string' && typeof entry.fetchedAt === 'number' ? entry : null;
      } catch {
        return null;
      }
    },
    async set(key, entry) {
      await redis.set(k(key), JSON.stringify(entry), 'EX', ttl);
    },
  };
}

type Outcome =
  | { kind: 'ok'; entry: CacheEntry }
  | { kind: 'limited' }
  | { kind: 'status'; status: number }
  | { kind: 'unreachable' };

/** Per-process coordination: one fetch per key, one upstream call at a time, the back-off. */
export interface ProxyState {
  inflight: Map<string, Promise<Outcome>>;
  chain: Promise<unknown>;
  backoffUntil: number;
  background: Set<Promise<unknown>>;
  /** Resolves once background refreshes have finished (tests, shutdown). */
  settled(): Promise<void>;
}

export function createProxyState(): ProxyState {
  const state: ProxyState = {
    inflight: new Map(),
    chain: Promise.resolve(),
    backoffUntil: 0,
    background: new Set(),
    settled: async () => {
      while (state.background.size) await Promise.allSettled([...state.background]);
    },
  };
  return state;
}

type FetchFn = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<Response>;

export interface ProxyDeps {
  fetchFn: FetchFn;
  token: string | undefined;
  cache: ExplorerCache;
  /** Create once per process and reuse across requests. */
  state?: ProxyState;
  now?: () => number;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const answer = (entry: CacheEntry, cache: 'hit' | 'stale' | 'miss') =>
  new Response(entry.body, {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Cache': cache },
  });

function validList(value: string | null, allowed: Set<string>): string[] | null {
  if (!value) return [];
  const items = value.split(',').filter(Boolean);
  return items.every((i) => allowed.has(i)) ? items : null;
}

const fallbackState = createProxyState();

function fetchUpstream(
  key: string,
  upstream: string,
  deps: ProxyDeps,
  state: ProxyState,
  now: () => number,
): Promise<Outcome> {
  const existing = state.inflight.get(key);
  if (existing) return existing;
  const run = async (): Promise<Outcome> => {
    if (now() < state.backoffUntil) return { kind: 'limited' };
    let res: Response;
    try {
      res = await deps.fetchFn(upstream, {
        headers: { Authorization: `Bearer ${deps.token}` },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      return { kind: 'unreachable' };
    }
    if (res.status === 429) {
      state.backoffUntil = now() + BACKOFF_MS;
      return { kind: 'limited' };
    }
    if (!res.ok) return { kind: 'status', status: res.status };
    const entry = { body: await res.text(), fetchedAt: now() };
    await deps.cache.set(key, entry);
    return { kind: 'ok', entry };
  };
  // Serialize upstream calls: Lichess asks clients to send one request at a time.
  const result = state.chain.then(run, run);
  state.chain = result.catch(() => undefined);
  state.inflight.set(key, result);
  void result.finally(() => state.inflight.delete(key)).catch(() => undefined);
  return result;
}

export async function handleExplorerRequest(
  source: string,
  url: URL,
  deps: ProxyDeps,
): Promise<Response> {
  if (!SOURCES.has(source)) return json(400, { error: 'Unknown explorer source' });
  const fen = url.searchParams.get('fen');
  if (!fen) return json(400, { error: 'Missing fen' });
  try {
    new Chess(fen);
  } catch {
    return json(400, { error: 'Invalid fen' });
  }
  const ratings = validList(url.searchParams.get('ratings'), RATINGS);
  const speeds = validList(url.searchParams.get('speeds'), SPEEDS);
  if (!ratings || !speeds) return json(400, { error: 'Invalid ratings or speeds' });
  if (!deps.token) return json(500, { error: 'Explorer not configured' });

  let upstream = `${UPSTREAM}/${source}?fen=${encodeURIComponent(fen)}&topGames=4`;
  if (source === 'lichess') {
    upstream += '&recentGames=0';
    if (ratings.length) upstream += `&ratings=${ratings.join(',')}`;
    if (speeds.length) upstream += `&speeds=${speeds.join(',')}`;
  }
  const key = upstream.slice(UPSTREAM.length + 1);
  const now = deps.now ?? Date.now;
  const state = deps.state ?? fallbackState;

  const cached = await deps.cache.get(key);
  const age = cached ? now() - cached.fetchedAt : Infinity;
  if (cached && age < FRESH_MS) return answer(cached, 'hit');
  if (cached && age < STALE_MS) {
    // Serve what we have and refresh in the background (skipped while backing off).
    if (now() >= state.backoffUntil && !state.inflight.has(key)) {
      const refresh = fetchUpstream(key, upstream, deps, state, now).catch(() => undefined);
      state.background.add(refresh);
      void refresh.finally(() => state.background.delete(refresh));
    }
    return answer(cached, 'stale');
  }

  const limited = () =>
    json(
      429,
      { error: 'The opening explorer is busy. Try again shortly.' },
      { 'Retry-After': String(Math.max(1, Math.ceil((state.backoffUntil - now()) / 1000))) },
    );
  if (now() < state.backoffUntil) return limited();

  const outcome = await fetchUpstream(key, upstream, deps, state, now);
  switch (outcome.kind) {
    case 'ok':
      return answer(outcome.entry, 'miss');
    case 'limited':
      return limited();
    case 'status':
      return json(outcome.status, { error: `Explorer returned HTTP ${outcome.status}` });
    case 'unreachable':
      return json(502, { error: 'Explorer unreachable' });
  }
}
