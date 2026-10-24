import type { AbortSignalLike } from '@chess/types';

/** Rejection reason for cancelled work; callers can ignore it (`err.name === 'AbortError'`). */
export class AbortError extends Error {
  constructor(message = 'The operation was aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

export function throwIfAborted(signal: AbortSignalLike | undefined): void {
  if (signal?.aborted) throw new AbortError();
}

type TimerApi = {
  setTimeout?: (cb: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
};

/** setTimeout/clearTimeout without DOM or Node types (every target runtime has them). */
export const timers = {
  set(cb: () => void, ms: number): unknown {
    return (globalThis as TimerApi).setTimeout?.(cb, ms);
  },
  clear(handle: unknown): void {
    (globalThis as TimerApi).clearTimeout?.(handle);
  },
};
