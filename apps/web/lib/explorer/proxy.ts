import { Chess } from 'chess.js';

/**
 * Server-side proxy to the Lichess opening explorer (plan ruling R3). The explorer needs a
 * personal token, which must never reach the browser; answers are cached for 10 minutes
 * because opening statistics barely move and Lichess rate-limits.
 */

const UPSTREAM = 'https://explorer.lichess.ovh';
const SOURCES = new Set(['masters', 'lichess']);
const RATINGS = new Set(['0', '1000', '1200', '1400', '1600', '1800', '2000', '2200', '2500']);
const SPEEDS = new Set(['ultraBullet', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence']);
const UPSTREAM_TIMEOUT_MS = 10_000;

interface Entry {
  body: string;
  expires: number;
}

export interface ExplorerCache {
  get(key: string): string | null;
  set(key: string, body: string): void;
}

/** Small LRU with a TTL (Map keeps insertion order; a hit re-inserts the key). */
export function createExplorerCache(
  opts: { ttlMs?: number; max?: number; now?: () => number } = {},
): ExplorerCache {
  const { ttlMs = 10 * 60_000, max = 500, now = Date.now } = opts;
  const entries = new Map<string, Entry>();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expires <= now()) {
        entries.delete(key);
        return null;
      }
      entries.delete(key);
      entries.set(key, entry);
      return entry.body;
    },
    set(key, body) {
      entries.delete(key);
      entries.set(key, { body, expires: now() + ttlMs });
      if (entries.size > max) entries.delete(entries.keys().next().value as string);
    },
  };
}

type FetchFn = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<Response>;

export interface ProxyDeps {
  fetchFn: FetchFn;
  token: string | undefined;
  cache: ExplorerCache;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function validList(value: string | null, allowed: Set<string>): string[] | null {
  if (!value) return [];
  const items = value.split(',').filter(Boolean);
  return items.every((i) => allowed.has(i)) ? items : null;
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

  const cached = deps.cache.get(upstream);
  if (cached !== null)
    return new Response(cached, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'hit' },
    });

  let res: Response;
  try {
    res = await deps.fetchFn(upstream, {
      headers: { Authorization: `Bearer ${deps.token}` },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return json(502, { error: 'Explorer unreachable' });
  }
  if (!res.ok) return json(res.status, { error: `Explorer returned HTTP ${res.status}` });

  const body = await res.text();
  deps.cache.set(upstream, body);
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Cache': 'miss' },
  });
}
