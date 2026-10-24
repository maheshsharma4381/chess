import { AbortError, throwIfAborted, timers, type EngineAdapter } from '@chess/chess-core';
import type { AbortSignalLike, EngineLine } from '@chess/types';
import { parseBestMove, parseInfoLine, type InfoLine } from './uci';

/** How UCI text travels: a Web Worker, a Node child/WASM instance, a socket... */
export interface UciTransport {
  send(cmd: string): void;
  /** May deliver several newline-separated lines per call. */
  onLine(cb: (line: string) => void): void;
  onError?(cb: (err: Error) => void): void;
  terminate(): void;
}

export type EngineErrorKind = 'timeout' | 'crashed' | 'quit';

export class EngineError extends Error {
  constructor(
    readonly kind: EngineErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export interface UciEngineOptions {
  /** For `uciok` / `readyok`. Default 15s (the WASM download happens before uciok). */
  readyTimeoutMs?: number;
  /** For `bestmove` after a depth search. Default 120s. */
  searchTimeoutMs?: number;
  /** A timed search (`movetime`) fails after movetime + this. Default 10s. */
  searchGraceMs?: number;
}

export interface BestMoveOptions {
  movetime?: number;
  depth?: number;
  /** Limit strength (Stockfish accepts 1320-3190). Omit for full strength. */
  elo?: number;
  multiPv?: number;
  signal?: AbortSignalLike;
}

/** Stockfish's UCI_Elo range. */
export const UCI_ELO_MIN = 1320;
export const UCI_ELO_MAX = 3190;

type SearchOptions = Record<string, string>;

/**
 * A UCI engine behind any transport. Searches run one at a time (engines are
 * single-threaded state machines); an aborted search is stopped and drained to its
 * `bestmove` before the next one starts, so no stale lines leak between searches.
 */
export class UciEngine implements EngineAdapter {
  private readonly handlers = new Set<(line: string) => void>();
  private readonly failures = new Set<(err: EngineError) => void>();
  private readonly options = new Map<string, string>();
  private ready: Promise<void> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private dead: EngineError | null = null;
  private readonly readyTimeoutMs: number;
  private readonly searchTimeoutMs: number;
  private readonly searchGraceMs: number;

  constructor(
    private readonly transport: UciTransport,
    opts: UciEngineOptions = {},
  ) {
    this.readyTimeoutMs = opts.readyTimeoutMs ?? 15_000;
    this.searchTimeoutMs = opts.searchTimeoutMs ?? 120_000;
    this.searchGraceMs = opts.searchGraceMs ?? 10_000;
    transport.onLine((chunk) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (line) for (const handle of [...this.handlers]) handle(line);
      }
    });
    transport.onError?.((err) =>
      this.fail(new EngineError('crashed', `Engine crashed: ${err.message}`)),
    );
  }

  /** `uci` → `uciok`, `isready` → `readyok`. Safe to call repeatedly. */
  init(): Promise<void> {
    this.ready ??= (async () => {
      await this.request('uci', (l) => l === 'uciok', this.readyTimeoutMs);
      await this.request('isready', (l) => l === 'readyok', this.readyTimeoutMs);
    })().catch((err: unknown) => {
      this.ready = null; // allow a retry after a timeout
      throw err;
    });
    return this.ready;
  }

  /** Full-strength MultiPV analysis (EngineAdapter): side-to-move scores, best line first. */
  analyse(
    fen: string,
    opts: { depth: number; multiPv: number; signal?: AbortSignalLike },
  ): Promise<EngineLine[]> {
    return this.exclusive(async () => {
      const options = { UCI_LimitStrength: 'false', MultiPV: String(opts.multiPv) };
      const search = await this.search(
        fen,
        `go depth ${opts.depth}`,
        options,
        opts.signal,
        this.searchTimeoutMs,
      );
      return search.lines;
    });
  }

  /** A move to play, optionally strength-limited, with the candidate lines it considered. */
  bestMove(
    fen: string,
    opts: BestMoveOptions = {},
  ): Promise<{ bestmove: string; lines: EngineLine[] }> {
    return this.exclusive(async () => {
      const options: SearchOptions = {
        UCI_LimitStrength: String(opts.elo !== undefined),
        MultiPV: String(opts.multiPv ?? 1),
      };
      if (opts.elo !== undefined) {
        options['UCI_Elo'] = String(
          Math.round(Math.min(UCI_ELO_MAX, Math.max(UCI_ELO_MIN, opts.elo))),
        );
      }
      const go = ['go'];
      if (opts.depth !== undefined) go.push(`depth ${opts.depth}`);
      const movetime = opts.movetime ?? (opts.depth === undefined ? 1000 : undefined);
      if (movetime !== undefined) go.push(`movetime ${movetime}`);
      // A timed search that overruns by seconds means the engine is stuck: fail fast.
      const timeout = movetime !== undefined ? movetime + this.searchGraceMs : this.searchTimeoutMs;
      return this.search(fen, go.join(' '), options, opts.signal, timeout);
    });
  }

  /** Interrupts the current search; its caller still receives a result. */
  stop(): void {
    this.transport.send('stop');
  }

  quit(): void {
    this.transport.send('quit');
    this.transport.terminate();
    this.fail(new EngineError('quit', 'Engine has quit'));
  }

  private async search(
    fen: string,
    go: string,
    options: SearchOptions,
    signal: AbortSignalLike | undefined,
    timeoutMs: number,
  ): Promise<{ bestmove: string; lines: EngineLine[] }> {
    throwIfAborted(signal);
    await this.init();
    for (const [name, value] of Object.entries(options)) this.setOption(name, value);
    await this.request('isready', (l) => l === 'readyok', this.readyTimeoutMs);
    throwIfAborted(signal);

    const latest = new Map<number, InfoLine>();
    const collect = (line: string) => {
      const info = parseInfoLine(line);
      const prev = info && latest.get(info.multipv);
      if (info && (!prev || info.depth >= prev.depth)) latest.set(info.multipv, info);
    };
    let aborted = false;
    const onAbort = () => {
      aborted = true;
      this.transport.send('stop');
    };

    this.handlers.add(collect);
    signal?.addEventListener('abort', onAbort);
    try {
      this.transport.send(`position fen ${fen}`);
      const line = await this.request(go, (l) => l.startsWith('bestmove'), timeoutMs);
      if (aborted) throw new AbortError();
      const best = parseBestMove(line);
      const lines = [...latest.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, i]) => ({ uci: i.pv[0] as string, pv: i.pv, score: i.score, depth: i.depth }));
      return { bestmove: best?.bestmove ?? lines[0]?.uci ?? '(none)', lines };
    } finally {
      this.handlers.delete(collect);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private setOption(name: string, value: string): void {
    if (this.options.get(name) === value) return;
    this.transport.send(`setoption name ${name} value ${value}`);
    this.options.set(name, value);
  }

  /** Sends `cmd` and resolves with the first line matching `done`. */
  private request(
    cmd: string,
    done: (line: string) => boolean,
    timeoutMs: number,
  ): Promise<string> {
    if (this.dead) return Promise.reject(this.dead);
    return new Promise<string>((resolve, reject) => {
      const settle = () => {
        this.handlers.delete(onLine);
        this.failures.delete(onFail);
        timers.clear(timer);
      };
      const onLine = (line: string) => {
        if (!done(line)) return;
        settle();
        resolve(line);
      };
      const onFail = (err: EngineError) => {
        settle();
        reject(err);
      };
      const timer = timers.set(
        () =>
          onFail(
            new EngineError('timeout', `Engine did not answer "${cmd}" within ${timeoutMs}ms`),
          ),
        timeoutMs,
      );
      this.handlers.add(onLine);
      this.failures.add(onFail);
      this.transport.send(cmd);
    });
  }

  private fail(err: EngineError): void {
    if (this.dead) return;
    this.dead = err;
    for (const reject of [...this.failures]) reject(err);
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    this.chain = run.catch(() => undefined);
    return run;
  }
}
