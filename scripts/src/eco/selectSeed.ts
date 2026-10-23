import type { RawOpening } from './parseTsv';
import { replayPgn } from './replayPgn';

export interface SeedSelection {
  seed: RawOpening[];
  /** Curated names with no matching row in the data. */
  missing: string[];
}

/**
 * Picks the offline fallback set: curated well-known openings first (shallowest row
 * per name), then the shallowest remaining lines, since every game passes through those.
 */
export function selectSeed(rows: RawOpening[], curated: string[], size: number): SeedSelection {
  const playable = rows.flatMap((row, index) => {
    try {
      return [{ row, index, plies: replayPgn(row.pgn).plies }];
    } catch {
      return [];
    }
  });
  const byDepth = [...playable].sort((a, b) => a.plies - b.plies || a.index - b.index);

  const chosen = new Set<number>();
  const missing: string[] = [];
  for (const name of curated) {
    const match = byDepth.find((p) => p.row.name === name);
    if (match) chosen.add(match.index);
    else missing.push(name);
  }
  for (const p of byDepth) {
    if (chosen.size >= size) break;
    chosen.add(p.index);
  }

  const seed = [...chosen].slice(0, size).map((i) => rows[i] as RawOpening);
  return { seed, missing };
}
