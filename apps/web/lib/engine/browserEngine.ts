import {
  UciEngine,
  createWorkerTransport,
  type UciTransport,
  type WorkerLike,
} from '@chess/engine';
import { createStore, type StoreApi } from 'zustand/vanilla';

export const ENGINE_URL = '/engine/stockfish-19-lite-single.js';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface EngineState {
  status: EngineStatus;
  error: string | null;
  /** Resolves the shared engine, starting the worker on first use. */
  getEngine(): Promise<UciEngine>;
  /** Drops a failed engine and starts again. */
  retry(): Promise<UciEngine>;
}

export interface EngineStoreDeps {
  createWorker?: (url: string) => WorkerLike;
  workerUrl?: string;
  /** Time allowed for the WASM download + `uciok`. */
  readyTimeoutMs?: number;
}

/**
 * One Stockfish worker per tab, started lazily. Start-up failures, silent workers and
 * later crashes all land in `status: 'error'` with a message and a retry, so the UI
 * never waits forever on a dead engine (plan Review Focus 3).
 */
export function createEngineStore(deps: EngineStoreDeps = {}): StoreApi<EngineState> {
  const createWorker = deps.createWorker ?? ((url) => new Worker(url) as unknown as WorkerLike);
  const url = deps.workerUrl ?? ENGINE_URL;
  let pending: Promise<UciEngine> | null = null;
  let current: UciEngine | null = null;

  return createStore<EngineState>()((set, get) => {
    const fail = (message: string) => {
      pending = null;
      current = null;
      set({ status: 'error', error: message });
    };

    const start = async (): Promise<UciEngine> => {
      set({ status: 'loading', error: null });
      try {
        const base = createWorkerTransport(createWorker(url));
        const transport: UciTransport = {
          ...base,
          onError: (cb) =>
            base.onError?.((err) => {
              cb(err);
              fail(err.message);
            }),
        };
        const engine = new UciEngine(transport, { readyTimeoutMs: deps.readyTimeoutMs ?? 20_000 });
        await engine.init();
        current = engine;
        set({ status: 'ready', error: null });
        return engine;
      } catch (err) {
        fail((err as Error).message);
        throw err;
      }
    };

    return {
      status: 'idle',
      error: null,
      getEngine: () => {
        pending ??= start();
        return pending;
      },
      retry: () => {
        current?.quit();
        pending = null;
        current = null;
        return get().getEngine();
      },
    };
  });
}

let shared: StoreApi<EngineState> | null = null;
/** The app-wide engine store (created on first use in the browser). */
export function engineStore(): StoreApi<EngineState> {
  shared ??= createEngineStore();
  return shared;
}
