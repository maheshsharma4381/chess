import { AbortError, throwIfAborted, timers } from '../abort';
import type {
  AbortSignalLike,
  CounterMove,
  ExplorerGame,
  ExplorerQueryOptions,
  ExplorerResponse,
} from '@chess/types';

export const LICHESS_EXPLORER_URL = 'https://explorer.lichess.ovh';

/** "Top Counter" needs a meaningful sample. */
export const TOP_COUNTER_MIN_GAMES = 100;

export class ExplorerError extends Error {
  constructor(
    message: string,
    /** HTTP status, or null for network and parse failures. */
    readonly status: number | null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ExplorerError';
  }
}

interface RawMove {
  uci: string;
  san: string;
  averageRating?: number | null;
  white: number;
  draws: number;
  black: number;
}

interface RawGame {
  id: string;
  uci?: string;
  winner: 'white' | 'black' | null;
  white: { name: string; rating: number };
  black: { name: string; rating: number };
  year?: number | null;
}

interface RawExplorer {
  white: number;
  draws: number;
  black: number;
  moves: RawMove[];
  topGames?: RawGame[];
  opening?: { eco: string; name: string } | null;
}

/**
 * The slice of `fetch` this service uses. Declared here because chess-core compiles
 * without DOM or Node types; browser, React Native and Node fetch all satisfy it.
 */
export type FetchLike = {
  // Method syntax keeps parameters bivariant, and `init` is loose enough that the platform
  // RequestInit (HeadersInit, AbortSignal | null) is compatible, so `fetch` itself is a FetchLike.
  fetch(
    url: string,
    init?: { headers?: unknown; signal?: AbortSignalLike | null },
  ): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}['fetch'];

type FetchResponse = Awaited<ReturnType<FetchLike>>;

export interface ExplorerServiceOptions {
  fetchFn?: FetchLike;
  /** Defaults to Lichess. Point it at the server proxy (`/api/opening-explorer`) in apps. */
  baseUrl?: string;
  /** Lichess personal API token; the explorer rejects anonymous requests with 401. */
  token?: string;
  /** Default 10s. A slow explorer must not leave the panel spinning forever. */
  timeoutMs?: number;
}

export const EXPLORER_TIMEOUT_MS = 10_000;

type AbortControllerLike = { signal: AbortSignalLike; abort(): void };
const newAbortController = (): AbortControllerLike | null => {
  const Ctor = (globalThis as { AbortController?: new () => AbortControllerLike }).AbortController;
  return Ctor ? new Ctor() : null;
};

const pct = (n: number, total: number) => (total === 0 ? 0 : (n / total) * 100);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isCount = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const hasCounts = (v: Record<string, unknown>) =>
  isCount(v['white']) && isCount(v['draws']) && isCount(v['black']);

function isRawMove(v: unknown): v is RawMove {
  return (
    isObject(v) && typeof v['uci'] === 'string' && typeof v['san'] === 'string' && hasCounts(v)
  );
}

function isRawGame(v: unknown): v is RawGame {
  const player = (p: unknown) =>
    isObject(p) && typeof p['name'] === 'string' && typeof p['rating'] === 'number';
  return isObject(v) && typeof v['id'] === 'string' && player(v['white']) && player(v['black']);
}

/** Validates the whole payload up front so a bad field can never yield half-mapped data. */
function isRawExplorer(value: unknown): value is RawExplorer {
  if (!isObject(value) || !hasCounts(value) || !Array.isArray(value['moves'])) return false;
  if (!value['moves'].every(isRawMove)) return false;
  const games = value['topGames'];
  return games === undefined || (Array.isArray(games) && games.every(isRawGame));
}

export class OpeningExplorerService {
  private readonly fetchFn: FetchLike;
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;

  constructor(options: ExplorerServiceOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? EXPLORER_TIMEOUT_MS;
    const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
    const fetchFn = options.fetchFn ?? globalFetch?.bind(globalThis);
    if (!fetchFn) throw new Error('OpeningExplorerService needs fetchFn when fetch is unavailable');
    this.fetchFn = fetchFn;
    this.baseUrl = (options.baseUrl ?? LICHESS_EXPLORER_URL).replace(/\/$/, '');
    this.token = options.token;
  }

  async query(fen: string, options: ExplorerQueryOptions): Promise<ExplorerResponse> {
    const raw = await this.fetchRaw(this.buildUrl(fen, options), options.signal);
    const whiteToMove = fen.trim().split(/\s+/)[1] !== 'b';
    return {
      opening: raw.opening ?? null,
      totalGames: raw.white + raw.draws + raw.black,
      counterMoves: rankCounterMoves(raw.moves, whiteToMove),
      topGames: (raw.topGames ?? []).map(toExplorerGame),
    };
  }

  private buildUrl(fen: string, { source, ratings, speeds }: ExplorerQueryOptions): string {
    let url = `${this.baseUrl}/${source}?fen=${encodeURIComponent(fen)}`;
    if (source === 'lichess') {
      if (ratings?.length) url += `&ratings=${ratings.join(',')}`;
      if (speeds?.length) url += `&speeds=${speeds.join(',')}`;
    }
    return url;
  }

  /** One request with the caller's abort signal and this service's timeout. */
  private send(url: string, signal: AbortSignalLike | undefined): Promise<FetchResponse> {
    throwIfAborted(signal);
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const controller = newAbortController();

    return new Promise<FetchResponse>((resolve, reject) => {
      const cleanup = () => {
        timers.clear(timer);
        signal?.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        cleanup();
        controller?.abort();
        reject(new AbortError());
      };
      const timer = timers.set(() => {
        cleanup();
        controller?.abort();
        reject(new ExplorerError(`Opening explorer timed out after ${this.timeoutMs}ms`, null));
      }, this.timeoutMs);
      signal?.addEventListener('abort', onAbort);

      this.fetchFn(url, controller ? { headers, signal: controller.signal } : { headers }).then(
        (res) => {
          cleanup();
          resolve(res);
        },
        (err: unknown) => {
          cleanup();
          // A no-op if the abort or timeout above already settled the promise.
          reject(
            new ExplorerError(`Opening explorer unreachable: ${(err as Error).message}`, null, {
              cause: err,
            }),
          );
        },
      );
    });
  }

  private async fetchRaw(url: string, signal: AbortSignalLike | undefined): Promise<RawExplorer> {
    const res = await this.send(url, signal);

    if (res.status === 401) {
      throw new ExplorerError('Opening explorer requires a Lichess API token (HTTP 401)', 401);
    }
    if (!res.ok)
      throw new ExplorerError(`Opening explorer returned HTTP ${res.status}`, res.status);

    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      throw new ExplorerError('Opening explorer returned malformed JSON', null, { cause: err });
    }
    if (!isRawExplorer(body)) {
      throw new ExplorerError('Opening explorer response has an unexpected shape', null);
    }
    return body;
  }
}

function rankCounterMoves(moves: RawMove[], whiteToMove: boolean): CounterMove[] {
  const mapped: CounterMove[] = moves.map((m) => {
    const total = m.white + m.draws + m.black;
    return {
      uci: m.uci,
      san: m.san,
      totalGames: total,
      whiteWinPct: pct(m.white, total),
      drawPct: pct(m.draws, total),
      blackWinPct: pct(m.black, total),
      averageRating: m.averageRating ?? null,
      badges: [],
    };
  });

  const sideWin = (m: CounterMove) => (whiteToMove ? m.whiteWinPct : m.blackWinPct);
  mapped.sort((a, b) => b.totalGames - a.totalGames || sideWin(b) - sideWin(a));

  const mainLine = mapped[0];
  if (mainLine && mainLine.totalGames > 0) mainLine.badges.push('Main Line');

  let topCounter: CounterMove | undefined;
  for (const m of mapped) {
    if (m.totalGames < TOP_COUNTER_MIN_GAMES) continue;
    if (!topCounter || sideWin(m) > sideWin(topCounter)) topCounter = m;
  }
  topCounter?.badges.push('Top Counter');

  return mapped;
}

function toExplorerGame(g: RawGame): ExplorerGame {
  return {
    id: g.id,
    white: g.white,
    black: g.black,
    result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '1/2-1/2',
    year: g.year ?? null,
    uci: g.uci ?? null,
  };
}
