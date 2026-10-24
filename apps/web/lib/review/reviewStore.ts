import { analyzeGame, type EngineAdapter } from '@chess/chess-core';
import type { OpeningLookupService } from '@chess/chess-core/book';
import type { AbortSignalLike, ReviewReport } from '@chess/types';
import { createStore, type StoreApi } from 'zustand/vanilla';

/** Plan ruling R1: lite single-threaded WASM makes depth 18 take minutes per game. */
export const QUICK_DEPTH = 14;
export const DEEP_DEPTH = 18;

export interface ReviewState {
  status: 'idle' | 'running' | 'done' | 'error';
  progress: { done: number; total: number };
  report: ReviewReport | null;
  error: string | null;
  /** Position shown: 0 = start, n = after ply n. */
  ply: number;
  depth: number;
  run(pgn: string, opts?: { depth?: number }): Promise<void>;
  cancel(): void;
  setPly(ply: number): void;
}

export interface ReviewDeps {
  getEngine: () => Promise<EngineAdapter>;
  loadBook: () => Promise<OpeningLookupService>;
}

type AbortControllerLike = { signal: AbortSignalLike; abort(): void };

/**
 * Game Review in the browser. One review at a time: a new run or cancel() aborts the
 * engine work of the previous one, whose late results are ignored.
 */
export function createReviewStore(deps: ReviewDeps): StoreApi<ReviewState> {
  let runId = 0;
  let controller: AbortControllerLike | null = null;

  return createStore<ReviewState>()((set, get) => ({
    status: 'idle',
    progress: { done: 0, total: 0 },
    report: null,
    error: null,
    ply: 0,
    depth: QUICK_DEPTH,

    async run(pgn, opts = {}) {
      get().cancel();
      const id = ++runId;
      const Ctor = (globalThis as { AbortController?: new () => AbortControllerLike })
        .AbortController;
      controller = Ctor ? new Ctor() : null;
      const depth = opts.depth ?? QUICK_DEPTH;
      set({
        status: 'running',
        progress: { done: 0, total: 0 },
        error: null,
        depth,
        report: null,
        ply: 0,
      });
      try {
        const [book, engine] = await Promise.all([deps.loadBook(), deps.getEngine()]);
        const report = await analyzeGame(
          { pgn },
          { engine, book },
          {
            depth,
            multiPv: 3,
            signal: controller?.signal,
            onProgress: (done, total) => {
              if (id === runId) set({ progress: { done, total } });
            },
          },
        );
        if (id === runId) set({ status: 'done', report });
      } catch (err) {
        if (id !== runId) return;
        if ((err as Error).name === 'AbortError') set({ status: 'idle' });
        else set({ status: 'error', error: (err as Error).message });
      }
    },

    cancel() {
      if (get().status !== 'running') return;
      controller?.abort();
      controller = null;
      set({ status: 'idle' });
    },

    setPly(ply) {
      const max = get().report?.moves.length ?? 0;
      set({ ply: Math.max(0, Math.min(max, Math.round(ply))) });
    },
  }));
}
