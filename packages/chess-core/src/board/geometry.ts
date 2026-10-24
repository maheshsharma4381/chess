import type { Chess, Color as ChessColor, PieceSymbol, Square } from 'chess.js';
import { PIECE_VALUE } from './material';

/** chess.js `board()`: row 0 is rank 8, column 0 is file a. */
export type Board = ReturnType<Chess['board']>;
export type BoardPiece = NonNullable<Board[number][number]>;

const FILES = 'abcdefgh';
const ORTHOGONAL: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAGONAL: ReadonlyArray<[number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const KNIGHT: ReadonlyArray<[number, number]> = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
const KING = [...ORTHOGONAL, ...DIAGONAL];

/** Kings outrank everything when comparing pin/skewer/fork targets. */
export const TARGET_VALUE: Record<PieceSymbol, number> = { ...PIECE_VALUE, k: 100 };

export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const coords = (square: string): [file: number, rank: number] => [
  FILES.indexOf(square[0] as string),
  Number(square[1]) - 1,
];
const toSquare = (file: number, rank: number) => `${FILES[file]}${rank + 1}` as Square;
const onBoard = (file: number, rank: number) => file >= 0 && file < 8 && rank >= 0 && rank < 8;

export function pieceAt(board: Board, square: string): BoardPiece | null {
  const [file, rank] = coords(square);
  return board[7 - rank]?.[file] ?? null;
}

export function piecesOf(board: Board, color: ChessColor): BoardPiece[] {
  return board.flat().filter((p): p is BoardPiece => p?.color === color);
}

export function slidingDirections(type: PieceSymbol): ReadonlyArray<[number, number]> {
  if (type === 'b') return DIAGONAL;
  if (type === 'r') return ORTHOGONAL;
  if (type === 'q') return KING;
  return [];
}

/** Squares the piece on `square` attacks (pseudo-legal; sliders stop at the first piece). */
export function attacksFrom(board: Board, square: string): Square[] {
  const piece = pieceAt(board, square);
  if (!piece) return [];
  const [f, r] = coords(square);
  const out: Square[] = [];
  const step = (offsets: ReadonlyArray<[number, number]>) => {
    for (const [df, dr] of offsets) if (onBoard(f + df, r + dr)) out.push(toSquare(f + df, r + dr));
  };

  switch (piece.type) {
    case 'p': {
      const dir = piece.color === 'w' ? 1 : -1;
      step([
        [1, dir],
        [-1, dir],
      ]);
      break;
    }
    case 'n':
      step(KNIGHT);
      break;
    case 'k':
      step(KING);
      break;
    default:
      for (const [df, dr] of slidingDirections(piece.type)) {
        for (let nf = f + df, nr = r + dr; onBoard(nf, nr); nf += df, nr += dr) {
          const sq = toSquare(nf, nr);
          out.push(sq);
          if (pieceAt(board, sq)) break;
        }
      }
  }
  return out;
}

export function isAttackedBy(board: Board, square: string, color: ChessColor): boolean {
  return piecesOf(board, color).some(
    (p) => p.square !== square && attacksFrom(board, p.square).includes(square as Square),
  );
}

export interface RayRelation {
  kind: 'pin' | 'skewer';
  attacker: BoardPiece;
  front: BoardPiece;
  back: BoardPiece;
}

/**
 * Pins and skewers by `color`'s sliders: two enemy pieces on one ray.
 * Pin (spec: "immobilized on a ray toward the King or Queen"): a knight, bishop, rook or
 * queen in front of a more valuable king or queen; pawn fronts are too noisy to report.
 * Skewer: the front piece is worth more than a minor-or-better piece behind it.
 */
export function rayRelations(board: Board, color: ChessColor): RayRelation[] {
  const out: RayRelation[] = [];
  for (const attacker of piecesOf(board, color)) {
    const [f, r] = coords(attacker.square);
    for (const [df, dr] of slidingDirections(attacker.type)) {
      const hit: BoardPiece[] = [];
      for (let nf = f + df, nr = r + dr; onBoard(nf, nr) && hit.length < 2; nf += df, nr += dr) {
        const p = pieceAt(board, toSquare(nf, nr));
        if (!p) continue;
        if (p.color === color) break;
        hit.push(p);
      }
      const [front, back] = hit;
      if (!front || !back) continue;
      const fv = TARGET_VALUE[front.type];
      const bv = TARGET_VALUE[back.type];
      const pinnable = front.type !== 'k' && front.type !== 'p';
      if (pinnable && (back.type === 'k' || back.type === 'q') && bv > fv) {
        out.push({ kind: 'pin', attacker, front, back });
      } else if (fv > bv && bv >= PIECE_VALUE.n) {
        out.push({ kind: 'skewer', attacker, front, back });
      }
    }
  }
  return out;
}
