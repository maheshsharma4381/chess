'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExplorerError, OpeningExplorerService } from '@chess/chess-core';
import type { ExplorerQueryOptions, ExplorerResponse, ExplorerSpeed } from '@chess/types';

export type ExplorerQueryService = Pick<OpeningExplorerService, 'query'>;

export interface ExplorerFilters {
  source: ExplorerQueryOptions['source'];
  ratings: number[];
  speeds: ExplorerSpeed[];
}

export type ExplorerState =
  | { status: 'loading' }
  | { status: 'ready'; data: ExplorerResponse }
  | { status: 'error'; message: string };

/** Board navigation fires FEN changes in bursts; wait for it to settle before asking Lichess. */
export const EXPLORER_DEBOUNCE_MS = 200;

/** The app-side explorer goes through the server proxy, which holds the Lichess token. */
export const EXPLORER_PROXY_URL = '/api/opening-explorer';

function describeError(err: unknown): string {
  if (err instanceof ExplorerError && err.status === 429) {
    return 'Lichess is rate-limiting requests. Try again in a minute.';
  }
  if (err instanceof ExplorerError && err.status === null && /timed out/.test(err.message)) {
    return 'The opening explorer took too long to answer.';
  }
  return 'Opening statistics could not be loaded.';
}

/**
 * Explorer statistics for `fen`. Each query is debounced and aborted when the position or
 * filters change, and results are keyed by their query, so a stale answer can never show
 * for the newer position.
 */
export function useExplorer(
  fen: string,
  filters: ExplorerFilters,
  service?: ExplorerQueryService,
): ExplorerState & { retry: () => void } {
  const svc = useMemo(
    () => service ?? new OpeningExplorerService({ baseUrl: EXPLORER_PROXY_URL }),
    [service],
  );
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; state: ExplorerState } | null>(null);

  const { source, ratings, speeds } = filters;
  const ratingKey = ratings.join(',');
  const speedKey = speeds.join(',');
  const key = `${attempt}|${source}|${ratingKey}|${speedKey}|${fen}`;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const options: ExplorerQueryOptions = { source, signal: controller.signal };
      if (source === 'lichess') {
        options.ratings = ratingKey ? ratingKey.split(',').map(Number) : [];
        options.speeds = speedKey ? (speedKey.split(',') as ExplorerSpeed[]) : [];
      }
      svc.query(fen, options).then(
        (data) => {
          if (!controller.signal.aborted) setResult({ key, state: { status: 'ready', data } });
        },
        (err: unknown) => {
          if (controller.signal.aborted || (err as Error).name === 'AbortError') return;
          setResult({ key, state: { status: 'error', message: describeError(err) } });
        },
      );
    }, EXPLORER_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [svc, key, fen, source, ratingKey, speedKey]);

  const state: ExplorerState = result?.key === key ? result.state : { status: 'loading' };
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
