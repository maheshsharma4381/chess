import type { UciTransport } from '../UciEngine';

/** The slice of a Web Worker the transport uses (structural: no DOM types in shared code). */
export interface WorkerLike {
  postMessage(message: string): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}

/** UCI over postMessage, e.g. `new Worker('/engine/stockfish-19-lite-single.js')`. */
export function createWorkerTransport(worker: WorkerLike): UciTransport {
  let onLine: (line: string) => void = () => {};
  let onError: (err: Error) => void = () => {};
  worker.onmessage = (event) => onLine(String(event.data));
  worker.onerror = (event) => onError(new Error(event.message || 'Engine worker failed'));
  return {
    send: (cmd) => worker.postMessage(cmd),
    onLine: (cb) => {
      onLine = cb;
    },
    onError: (cb) => {
      onError = cb;
    },
    terminate: () => worker.terminate(),
  };
}
