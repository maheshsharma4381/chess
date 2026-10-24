import { Chess, type Square } from 'chess.js';

/** A piece as a FEN letter: uppercase White, lowercase Black. */
export type PieceChar = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'k' | 'q' | 'r' | 'b' | 'n' | 'p';

/** The editor's position (plan ruling R5): pieces, side to move and the castling letters. */
export interface EditorPosition {
  pieces: Partial<Record<string, PieceChar>>;
  turn: 'w' | 'b';
  /** Any of "KQkq"; rights whose king or rook moved off are dropped by `editorFen`. */
  castling: string;
}

const FILES = 'abcdefgh';
/** Each castling right needs its king and rook on their start squares. */
const CASTLING_SQUARES: Record<string, [string, PieceChar, string, PieceChar]> = {
  K: ['e1', 'K', 'h1', 'R'],
  Q: ['e1', 'K', 'a1', 'R'],
  k: ['e8', 'k', 'h8', 'r'],
  q: ['e8', 'k', 'a8', 'r'],
};

export const emptyPosition = (): EditorPosition => ({ pieces: {}, turn: 'w', castling: '' });

export function positionFromFen(fen: string): EditorPosition {
  const [placement = '', turn = 'w', castling = '-'] = fen.trim().split(/\s+/);
  const pieces: EditorPosition['pieces'] = {};
  placement.split('/').forEach((rank, row) => {
    let col = 0;
    for (const ch of rank) {
      if (/\d/.test(ch)) col += Number(ch);
      else pieces[`${FILES[col++]}${8 - row}`] = ch as PieceChar;
    }
  });
  return { pieces, turn: turn === 'b' ? 'b' : 'w', castling: castling === '-' ? '' : castling };
}

export function editorFen({ pieces, turn, castling }: EditorPosition): string {
  const ranks: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let empty = 0;
    for (const file of FILES) {
      const piece = pieces[`${file}${rank}`];
      if (!piece) {
        empty++;
        continue;
      }
      if (empty) row += empty;
      row += piece;
      empty = 0;
    }
    ranks.push(empty ? row + empty : row);
  }
  const rights = 'KQkq'
    .split('')
    .filter((r) => {
      const [kSq, k, rSq, rook] = CASTLING_SQUARES[r]!;
      return castling.includes(r) && pieces[kSq] === k && pieces[rSq] === rook;
    })
    .join('');
  return `${ranks.join('/')} ${turn} ${rights || '-'} - 0 1`;
}

/** Why the position cannot be analysed, or null when it can. */
export function validateEditorPosition(pos: EditorPosition): string | null {
  const all = Object.entries(pos.pieces);
  const count = (p: PieceChar) => all.filter(([, x]) => x === p).length;
  if (count('K') !== 1) return 'White needs exactly one king.';
  if (count('k') !== 1) return 'Black needs exactly one king.';
  if (all.some(([sq, p]) => (p === 'P' || p === 'p') && /[18]$/.test(sq))) {
    return 'Pawns cannot stand on the first or last rank.';
  }

  const fen = editorFen(pos);
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch (err) {
    return (err as Error).message;
  }
  // The side that just "moved" must not be left in check.
  const waiting = pos.turn === 'w' ? 'b' : 'w';
  const king = all.find(([, p]) => p === (waiting === 'w' ? 'K' : 'k'))![0] as Square;
  if (chess.isAttacked(king, pos.turn)) {
    const [inCheck, toMove] = waiting === 'w' ? ['White', 'Black'] : ['Black', 'White'];
    return `${inCheck} is in check but it is ${toMove} to move.`;
  }
  return null;
}
