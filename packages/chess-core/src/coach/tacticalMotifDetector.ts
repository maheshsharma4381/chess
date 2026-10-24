import {
  Chess,
  type Color as ChessColor,
  type Move,
  type PieceSymbol,
  type Square,
} from 'chess.js';
import type { BookOpening, Motif, Score } from '@chess/types';
import {
  PIECE_NAME,
  TARGET_VALUE,
  attacksFrom,
  isAttackedBy,
  pieceAt,
  piecesOf,
  rayRelations,
  slidingDirections,
  type Board,
} from '../board/geometry';
import { PIECE_VALUE, see } from '../board/material';

export interface MotifInput {
  fenBefore: string;
  /** The played move. */
  uci: string;
  /** 1-based ply of the played move. */
  ply: number;
  /** Engine best line from fenBefore (UCI). */
  bestLine: string[];
  /** Engine best line from the position after the played move (UCI, opponent first). */
  replyLine: string[];
  /** Best evaluation after the played move, White POV. */
  scoreAfter: Score;
  isBook: boolean;
  bookOpening: BookOpening | null;
  /** Set on the ply that left book: the theory move the player could have chosen. */
  deviation: { bestBookSan: string } | null;
  sacrifice: boolean;
}

/** Who a motif belongs to: the played move, the missed best move, or the opponent's reply. */
type Source = 'played' | 'best' | 'reply';

/** Opening concepts (development, center) only matter in the first 10 moves. */
const OPENING_PLIES = 20;
/** Lines are only replayed this far when looking for mates. */
const MAX_LINE_PLIES = 12;
const CENTER = new Set(['d4', 'e4', 'd5', 'e5']);

const other = (c: ChessColor): ChessColor => (c === 'w' ? 'b' : 'w');

/** ["king", "rook", "bishop"] -> "king, rook and bishop". */
const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

function play(chess: Chess, uci: string): Move | null {
  try {
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
}

/** The moved piece attacks two or more worthwhile targets: the king, bigger pieces, or loose pieces. */
function forkBy(board: Board, square: Square, source: Source): Motif | null {
  const attacker = pieceAt(board, square);
  if (!attacker) return null;
  const targets = attacksFrom(board, square).filter((sq) => {
    const target = pieceAt(board, sq);
    if (!target || target.color === attacker.color || target.type === 'p') return false;
    return (
      target.type === 'k' ||
      TARGET_VALUE[target.type] > TARGET_VALUE[attacker.type] ||
      !isAttackedBy(board, sq, target.color)
    );
  });
  if (targets.length < 2) return null;
  const names = targets.map((sq) => PIECE_NAME[(pieceAt(board, sq) as { type: PieceSymbol }).type]);
  return {
    type: 'fork',
    squares: [square, ...targets],
    detail: { piece: PIECE_NAME[attacker.type], targets: joinNames(names), source },
  };
}

function hangingPieces(fenAfter: string, board: Board, mover: ChessColor): Motif[] {
  return piecesOf(board, mover)
    .filter((p) => p.type !== 'p' && p.type !== 'k' && see(fenAfter, p.square) > 0)
    .map((p) => ({
      type: 'hanging-piece' as const,
      squares: [p.square],
      detail: { piece: PIECE_NAME[p.type], source: 'played' },
    }));
}

function newRayRelations(before: Board, after: Board, mover: ChessColor): Motif[] {
  const key = (r: ReturnType<typeof rayRelations>[number]) =>
    `${r.kind}:${r.attacker.square}:${r.front.square}:${r.back.square}`;
  const existing = new Set(rayRelations(before, mover).map(key));
  return rayRelations(after, mover)
    .filter((r) => !existing.has(key(r)))
    .map((r) => ({
      type: r.kind,
      squares: [r.attacker.square, r.front.square, r.back.square],
      detail: {
        piece: PIECE_NAME[r.front.type],
        behind: PIECE_NAME[r.back.type],
        source: 'played',
      },
    }));
}

/** A slider (other than the moved piece) newly attacks the king or a valuable/loose piece. */
function discoveries(before: Board, after: Board, move: Move): Motif[] {
  const out: Motif[] = [];
  for (const slider of piecesOf(after, move.color)) {
    if (slider.square === move.to || slidingDirections(slider.type).length === 0) continue;
    const had = new Set(attacksFrom(before, slider.square));
    for (const sq of attacksFrom(after, slider.square)) {
      if (had.has(sq)) continue;
      const target = pieceAt(after, sq);
      if (!target || target.color === move.color) continue;
      if (target.type === 'k') {
        out.push({
          type: 'discovered-check',
          squares: [slider.square, sq],
          detail: { source: 'played' },
        });
      } else if (
        TARGET_VALUE[target.type] >= PIECE_VALUE.r ||
        (TARGET_VALUE[target.type] >= PIECE_VALUE.n && !isAttackedBy(after, sq, target.color))
      ) {
        out.push({
          type: 'discovered-attack',
          squares: [slider.square, sq],
          detail: { piece: PIECE_NAME[target.type], source: 'played' },
        });
      }
    }
  }
  return out;
}

/** Replays a line; if it ends in a mate along the mated king's back rank, reports it. */
function backRankMate(
  fen: string,
  line: string[],
  source: (mated: ChessColor) => Source,
): Motif | null {
  const chess = new Chess(fen);
  let last: Move | null = null;
  for (const uci of line.slice(0, MAX_LINE_PLIES)) {
    last = play(chess, uci);
    if (!last) return null;
  }
  if (!last || !chess.isCheckmate()) return null;
  const mated = chess.turn();
  const kingSquare = chess.findPiece({ type: 'k', color: mated })[0];
  if (!kingSquare) return null;
  const backRank = mated === 'w' ? '1' : '8';
  if (kingSquare[1] !== backRank || last.to[1] !== backRank) return null;
  return { type: 'back-rank', squares: [last.to, kingSquare], detail: { source: source(mated) } };
}

function pawnFiles(board: Board, color: ChessColor): number[] {
  return piecesOf(board, color)
    .filter((p) => p.type === 'p')
    .map((p) => 'abcdefgh'.indexOf(p.square[0] as string));
}

function pawnIssues(board: Board, color: ChessColor) {
  const files = pawnFiles(board, color);
  const counts = new Map<number, number>();
  for (const f of files) counts.set(f, (counts.get(f) ?? 0) + 1);
  const doubled = [...counts.values()].reduce((n, c) => n + (c > 1 ? c - 1 : 0), 0);
  const isolated = files.filter((f) => !counts.has(f - 1) && !counts.has(f + 1)).length;

  const enemy = piecesOf(board, other(color)).filter((p) => p.type === 'p');
  const passed = piecesOf(board, color)
    .filter((p) => p.type === 'p')
    .filter((p) => {
      const f = 'abcdefgh'.indexOf(p.square[0] as string);
      const r = Number(p.square[1]);
      return !enemy.some((e) => {
        const ef = 'abcdefgh'.indexOf(e.square[0] as string);
        const er = Number(e.square[1]);
        return Math.abs(ef - f) <= 1 && (color === 'w' ? er > r : er < r);
      });
    }).length;
  return { doubled, isolated, passed };
}

function positional(before: Board, after: Board, move: Move, ply: number): Motif[] {
  const out: Motif[] = [];
  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    out.push({
      type: 'king-safety',
      squares: [move.to],
      detail: { castled: move.isKingsideCastle() ? 'kingside' : 'queenside' },
    });
  }

  const was = pawnIssues(before, move.color);
  const now = pawnIssues(after, move.color);
  for (const issue of ['doubled', 'isolated', 'passed'] as const) {
    if (now[issue] > was[issue]) {
      out.push({ type: 'pawn-structure', squares: [move.to], detail: { issue } });
    }
  }

  if (ply <= OPENING_PLIES) {
    const homeRank = move.color === 'w' ? '1' : '8';
    if ((move.piece === 'n' || move.piece === 'b') && move.from[1] === homeRank) {
      out.push({
        type: 'development',
        squares: [move.to],
        detail: { piece: PIECE_NAME[move.piece] },
      });
    }
    if (move.piece === 'p' && CENTER.has(move.to)) {
      out.push({ type: 'center-control', squares: [move.to], detail: {} });
    }
  }
  return out;
}

/**
 * Explains a move's tactical and positional content from the board delta, the engine's
 * best line (what was missed) and its reply line (what the opponent threatens).
 * Ordered most important first: mates, tactics, material, book, positional.
 */
export function detectMotifs(input: MotifInput): Motif[] {
  const chess = new Chess(input.fenBefore);
  const before = chess.board();
  const move = play(chess, input.uci);
  if (!move) throw new Error(`Illegal move ${input.uci} in ${input.fenBefore}`);
  const fenAfter = chess.fen();
  const after = chess.board();
  const mover = move.color;
  const motifs: Motif[] = [];

  // Mates: along the best line (missed or played) and the reply line (threat or our own mate).
  const playedBest = input.bestLine[0] === input.uci;
  const bestMate = playedBest ? null : backRankMate(input.fenBefore, input.bestLine, () => 'best');
  const replyMate = backRankMate(fenAfter, input.replyLine, (mated) =>
    mated === mover ? 'reply' : 'played',
  );
  for (const m of [replyMate, bestMate]) if (m) motifs.push(m);

  if ('mate' in input.scoreAfter) {
    const moverMates = input.scoreAfter.mate > 0 === (mover === 'w');
    const source: Source = moverMates ? 'played' : 'reply';
    if (replyMate?.detail['source'] !== source) {
      motifs.push({
        type: 'mate-threat',
        squares: [],
        detail: { source, mateIn: Math.abs(input.scoreAfter.mate) },
      });
    }
  }

  // Tactics created by the played move.
  const playedFork = forkBy(after, move.to, 'played');
  if (playedFork) motifs.push(playedFork);
  motifs.push(...discoveries(before, after, move));
  motifs.push(...newRayRelations(before, after, mover));

  // Tactics the best line had, and the opponent's immediate reply.
  if (!playedBest && input.bestLine[0]) {
    const alt = new Chess(input.fenBefore);
    const best = play(alt, input.bestLine[0]);
    const fork = best && forkBy(alt.board(), best.to, 'best');
    if (fork) motifs.push(fork);
  }
  if (input.replyLine[0]) {
    const reply = new Chess(fenAfter);
    const answer = play(reply, input.replyLine[0]);
    const fork = answer && forkBy(reply.board(), answer.to, 'reply');
    if (fork) motifs.push(fork);
  }

  motifs.push(...hangingPieces(fenAfter, after, mover));
  if (input.sacrifice) motifs.push({ type: 'sacrifice', squares: [move.to], detail: {} });

  const opening = input.bookOpening;
  if (input.isBook && opening) {
    motifs.push({ type: 'book', squares: [], detail: { eco: opening.eco, name: opening.name } });
  }
  if (input.deviation && opening) {
    motifs.push({
      type: 'book-deviation',
      squares: [],
      detail: { eco: opening.eco, name: opening.name, bestBookSan: input.deviation.bestBookSan },
    });
  }

  motifs.push(...positional(before, after, move, input.ply));
  return motifs;
}
