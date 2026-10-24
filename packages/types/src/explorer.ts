import type { AbortSignalLike } from './abort';

export type ExplorerSource = 'masters' | 'lichess';

export type ExplorerSpeed =
  'ultraBullet' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence';

export interface ExplorerQueryOptions {
  source: ExplorerSource;
  /** Aborting rejects the query with an AbortError (e.g. the user left the page). */
  signal?: AbortSignalLike;
  /** Lichess DB only: rating brackets, e.g. [1600, 1800]. */
  ratings?: number[];
  /** Lichess DB only. */
  speeds?: ExplorerSpeed[];
}

export type CounterMoveBadge = 'Main Line' | 'Top Counter';

export interface CounterMove {
  uci: string;
  san: string;
  totalGames: number;
  whiteWinPct: number;
  drawPct: number;
  blackWinPct: number;
  averageRating: number | null;
  badges: CounterMoveBadge[];
}

export interface ExplorerGame {
  id: string;
  white: { name: string; rating: number };
  black: { name: string; rating: number };
  result: '1-0' | '0-1' | '1/2-1/2';
  year: number | null;
  /** The move played from the queried position, if known. */
  uci: string | null;
}

export interface ExplorerResponse {
  opening: { eco: string; name: string } | null;
  totalGames: number;
  /** Sorted by popularity, then by the side to move's win rate. */
  counterMoves: CounterMove[];
  topGames: ExplorerGame[];
}
