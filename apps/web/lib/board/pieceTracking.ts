import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { FILES } from './squares';

export interface TrackedPiece {
  /** Stable across positions, so React keeps the element and CSS can slide it. */
  id: string;
  square: Square;
  type: PieceSymbol;
  color: Color;
}

const coords = (sq: string) =>
  [FILES.indexOf(sq[0] as (typeof FILES)[number]), Number(sq[1])] as const;
const distance = (a: string, b: string) => {
  const [af, ar] = coords(a);
  const [bf, br] = coords(b);
  return Math.max(Math.abs(af - bf), Math.abs(ar - br));
};

/**
 * Matches pieces of the new position to the previous one: unchanged squares keep their id,
 * then a moved piece takes the id of the nearest vanished piece of the same kind (a promoted
 * piece takes its pawn's). Anything else gets a fresh id.
 */
export function trackPieces(prev: readonly TrackedPiece[], fen: string): TrackedPiece[] {
  const placed = new Chess(fen)
    .board()
    .flat()
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const unmatched = [...prev];
  const take = (match: (p: TrackedPiece) => boolean, near?: string): TrackedPiece | undefined => {
    const candidates = unmatched.filter(match);
    if (candidates.length === 0) return undefined;
    const best = near
      ? candidates.reduce((a, b) => (distance(b.square, near) < distance(a.square, near) ? b : a))
      : candidates[0];
    unmatched.splice(unmatched.indexOf(best as TrackedPiece), 1);
    return best;
  };

  let nextId = prev.reduce((max, p) => Math.max(max, Number(p.id.slice(1)) || 0), 0) + 1;
  const result: Array<TrackedPiece | null> = placed.map((p) => {
    const same = take((t) => t.square === p.square && t.type === p.type && t.color === p.color);
    return same ? { ...same } : null;
  });

  placed.forEach((p, i) => {
    if (result[i]) return;
    const moved =
      take((t) => t.type === p.type && t.color === p.color, p.square) ??
      take((t) => t.type === 'p' && t.color === p.color, p.square);
    result[i] = { id: moved?.id ?? `p${nextId++}`, square: p.square, type: p.type, color: p.color };
  });
  return result as TrackedPiece[];
}
