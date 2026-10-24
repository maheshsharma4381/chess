import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** A loss of at least this much material (pawns) counts as a sacrifice (plan ruling R4). */
export const SACRIFICE_THRESHOLD = 2;

/** White material minus Black material, in pawns. */
export function materialBalance(fen: string): number {
  let balance = 0;
  for (const row of new Chess(fen).board()) {
    for (const sq of row) {
      if (sq) balance += sq.color === 'w' ? PIECE_VALUE[sq.type] : -PIECE_VALUE[sq.type];
    }
  }
  return balance;
}

/** Knights, bishops, rooks and queens of both colors. */
export function majorsAndMinors(fen: string): number {
  let count = 0;
  for (const row of new Chess(fen).board()) {
    for (const sq of row) if (sq && sq.type !== 'p' && sq.type !== 'k') count++;
  }
  return count;
}

/**
 * The legal capture onto `square` by the least valuable attacker (promotions only to a
 * queen; en passant never applies because the target square is occupied). Only the
 * attacking pieces' moves are generated: full verbose move generation is ~13x slower.
 */
function leastValuableCapture(chess: Chess, square: Square): Move | null {
  if (!chess.get(square)) return null;
  const attackers = chess
    .attackers(square, chess.turn())
    .map((from) => ({ from, piece: chess.get(from) }))
    .sort((a, b) => PIECE_VALUE[a.piece?.type ?? 'k'] - PIECE_VALUE[b.piece?.type ?? 'k']);
  for (const { from } of attackers) {
    const capture = chess
      .moves({ square: from, verbose: true })
      .find((m) => m.to === square && (!m.promotion || m.promotion === 'q'));
    if (capture) return capture;
  }
  return null;
}

/**
 * Net gain for the side to move from capturing on `square` with its least valuable
 * attacker, after which each side may stop recapturing. Null if no capture exists.
 */
function forcedExchange(chess: Chess, square: Square): number | null {
  const capture = leastValuableCapture(chess, square);
  if (!capture) return null;

  const gain =
    PIECE_VALUE[capture.captured as PieceSymbol] +
    (capture.promotion ? PIECE_VALUE[capture.promotion] - PIECE_VALUE.p : 0);
  chess.move(capture);
  const reply = forcedExchange(chess, square);
  chess.undo();
  return gain - Math.max(0, reply ?? 0);
}

/** Static exchange evaluation of capturing on `square` for the side to move; 0 if no capture. */
export function see(fen: string, square: string): number {
  return forcedExchange(new Chess(fen), square as Square) ?? 0;
}

/**
 * True when the move gives up at least {@link SACRIFICE_THRESHOLD} pawns of material:
 * what it captures, minus the opponent's best static exchange against any of the
 * mover's pieces afterwards.
 */
export function isSacrifice(fenBefore: string, uci: string): boolean {
  const chess = new Chess(fenBefore);
  const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  const mover = move.color;

  let gained = move.captured ? PIECE_VALUE[move.captured] : 0;
  if (move.promotion) gained += PIECE_VALUE[move.promotion] - PIECE_VALUE.p;

  let opponentBest = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== mover || sq.type === 'k') continue;
      opponentBest = Math.max(opponentBest, forcedExchange(chess, sq.square) ?? 0);
    }
  }
  return gained - opponentBest <= -SACRIFICE_THRESHOLD;
}
