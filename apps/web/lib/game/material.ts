import { Chess, type PieceSymbol } from 'chess.js';
import { PIECE_VALUE } from '@chess/chess-core';

const START_COUNT: Record<Exclude<PieceSymbol, 'k'>, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const ORDER: Array<Exclude<PieceSymbol, 'k'>> = ['p', 'n', 'b', 'r', 'q'];

/** Pieces each side has taken (missing from the opponent's set) and White's material lead. */
export function capturedPieces(fen: string): {
  byWhite: PieceSymbol[];
  byBlack: PieceSymbol[];
  diff: number;
} {
  const counts = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  let diff = 0;
  for (const sq of new Chess(fen).board().flat()) {
    if (!sq || sq.type === 'k') continue;
    counts[sq.color][sq.type]++;
    diff += sq.color === 'w' ? PIECE_VALUE[sq.type] : -PIECE_VALUE[sq.type];
  }
  // Promotions can leave "more than the starting set"; never show negative captures.
  const missing = (color: 'w' | 'b') =>
    ORDER.flatMap((t) =>
      Array<PieceSymbol>(Math.max(0, START_COUNT[t] - counts[color][t])).fill(t),
    );
  return { byWhite: missing('b'), byBlack: missing('w'), diff };
}
