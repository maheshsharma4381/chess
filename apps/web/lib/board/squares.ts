import type { Square } from 'chess.js';

export type Orientation = 'white' | 'black';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

/** All 64 squares, top-left first, as the user sees them. */
export function squaresInDisplayOrder(orientation: Orientation): Square[] {
  const files = orientation === 'white' ? FILES : [...FILES].reverse();
  const ranks = orientation === 'white' ? [...RANKS].reverse() : RANKS;
  return ranks.flatMap((r) => files.map((f) => `${f}${r}` as Square));
}

export function squareColor(square: string): 'light' | 'dark' {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square[1]) - 1;
  return (file + rank) % 2 === 0 ? 'dark' : 'light';
}

/** Display coordinates: column and row (0-7, top-left origin) for a square. */
export function displayPosition(
  square: string,
  orientation: Orientation,
): { col: number; row: number } {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square[1]) - 1;
  return orientation === 'white' ? { col: file, row: 7 - rank } : { col: 7 - file, row: rank };
}

export function squareAt(col: number, row: number, orientation: Orientation): Square {
  const file = orientation === 'white' ? col : 7 - col;
  const rank = orientation === 'white' ? 7 - row : row;
  return `${FILES[file]}${RANKS[rank]}` as Square;
}
