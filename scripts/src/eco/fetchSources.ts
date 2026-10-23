import type { EcoBook } from '@chess/types';
import { parseTsv, type RawOpening } from './parseTsv';

export const ECO_BASE_URL = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/';
export const ECO_FILES = ['a', 'b', 'c', 'd', 'e'] as const;

export interface FetchOptions {
  fetchFn?: typeof fetch;
  retries?: number;
  timeoutMs?: number;
}

async function fetchText(url: string, fetchFn: typeof fetch, retries: number, timeoutMs: number) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`GET ${url} failed with HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`GET ${url} failed`);
}

/** Downloads all five Lichess TSVs. Rejects if any file fails, so callers never see a partial set. */
export async function fetchSources(options: FetchOptions = {}): Promise<RawOpening[]> {
  const { fetchFn = fetch, retries = 2, timeoutMs = 15_000 } = options;
  const texts = await Promise.all(
    ECO_FILES.map((f) => fetchText(`${ECO_BASE_URL}${f}.tsv`, fetchFn, retries, timeoutMs)),
  );
  return texts.flatMap(parseTsv);
}

export type FallbackDecision = { action: 'keep' } | { action: 'write-seed' };

/** After a failed download: never replace a full Lichess book with the smaller seed. */
export function resolveFallback(existing: Pick<EcoBook, 'source'> | null): FallbackDecision {
  return existing?.source === 'lichess' ? { action: 'keep' } : { action: 'write-seed' };
}
