import type { EcoBook } from '@chess/types';
import { parseTsv, type RawOpening } from './parseTsv';

export const ECO_BASE_URL = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/';
export const ECO_FILES = ['a', 'b', 'c', 'd', 'e'] as const;

export interface FetchOptions {
  fetchFn?: typeof fetch;
  retries?: number;
  timeoutMs?: number;
  /** Smallest real volume (E) has ~360 rows; fewer means a truncated or non-TSV body. */
  minRowsPerFile?: number;
}

async function fetchText(url: string, fetchFn: typeof fetch, retries: number, timeoutMs: number) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastError = err;
    }
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`GET ${url} failed: ${reason}`, { cause: lastError });
}

function validateVolume(file: string, url: string, rows: RawOpening[], minRows: number) {
  if (rows.length < minRows) {
    throw new Error(`${url} parsed to ${rows.length} rows (expected >= ${minRows})`);
  }
  const foreign = rows.find((r) => r.eco[0] !== file.toUpperCase());
  if (foreign) throw new Error(`${url} contains ${foreign.eco}, which belongs to another volume`);
}

/**
 * Downloads all five Lichess TSVs. Rejects if any file fails or looks truncated,
 * so callers never see a partial set.
 */
export async function fetchSources(options: FetchOptions = {}): Promise<RawOpening[]> {
  const { fetchFn = fetch, retries = 2, timeoutMs = 15_000, minRowsPerFile = 50 } = options;
  const volumes = await Promise.all(
    ECO_FILES.map(async (file) => {
      const url = `${ECO_BASE_URL}${file}.tsv`;
      const rows = parseTsv(await fetchText(url, fetchFn, retries, timeoutMs));
      validateVolume(file, url, rows, minRowsPerFile);
      return rows;
    }),
  );
  return volumes.flat();
}

export type FallbackDecision = { action: 'keep' } | { action: 'write-seed' };

/** After a failed download: never replace a full Lichess book with the smaller seed. */
export function resolveFallback(existing: Pick<EcoBook, 'source'> | null): FallbackDecision {
  return existing?.source === 'lichess' ? { action: 'keep' } : { action: 'write-seed' };
}
