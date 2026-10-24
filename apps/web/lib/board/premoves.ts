import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { FILES } from './squares';

export interface Premove {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

const KNIGHT = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
] as const;
const KING = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;
const ROOK_DIRS = KING.slice(0, 4);
const BISHOP_DIRS = KING.slice(4);

const toSquare = (f: number, r: number) => `${FILES[f]}${r + 1}` as Square;
const inBounds = (f: number, r: number) => f >= 0 && f < 8 && r >= 0 && r < 8;

/**
 * Where a piece could go on a premove: its movement pattern ignoring every other piece,
 * because the opponent's move is still to come (the Lichess convention).
 */
export function premoveTargets(from: string, piece: { type: PieceSymbol; color: Color }): Square[] {
  const f = FILES.indexOf(from[0] as (typeof FILES)[number]);
  const r = Number(from[1]) - 1;
  const out: Square[] = [];
  const add = (df: number, dr: number) =>
    inBounds(f + df, r + dr) && out.push(toSquare(f + df, r + dr));
  const slide = (dirs: ReadonlyArray<readonly [number, number]>) => {
    for (const [df, dr] of dirs) {
      for (let i = 1; inBounds(f + df * i, r + dr * i); i++)
        out.push(toSquare(f + df * i, r + dr * i));
    }
  };

  switch (piece.type) {
    case 'n':
      for (const [df, dr] of KNIGHT) add(df, dr);
      break;
    case 'k': {
      for (const [df, dr] of KING) add(df, dr);
      const home = piece.color === 'w' ? 0 : 7;
      if (f === 4 && r === home) {
        add(2, 0);
        add(-2, 0);
      }
      break;
    }
    case 'r':
      slide(ROOK_DIRS);
      break;
    case 'b':
      slide(BISHOP_DIRS);
      break;
    case 'q':
      slide(KING);
      break;
    case 'p': {
      const dir = piece.color === 'w' ? 1 : -1;
      const start = piece.color === 'w' ? 1 : 6;
      add(0, dir);
      if (r === start) add(0, 2 * dir);
      add(1, dir);
      add(-1, dir);
      break;
    }
  }
  return out;
}

export const isPromotionSquare = (piece: { type: PieceSymbol; color: Color }, to: string) =>
  piece.type === 'p' && to[1] === (piece.color === 'w' ? '8' : '1');

/** The position the user is planning against: the real board with queued premoves applied. */
export function virtualBoard(fen: string, premoves: readonly Premove[]): Chess {
  const chess = new Chess(fen);
  for (const p of premoves) {
    const piece = chess.get(p.from);
    if (!piece) continue;
    chess.remove(p.from);
    chess.put(p.promotion ? { type: p.promotion, color: piece.color } : piece, p.to);
  }
  return chess;
}
