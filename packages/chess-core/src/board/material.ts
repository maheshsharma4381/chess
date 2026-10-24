import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

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
 * Net gain for the side to move from capturing on `square` with its least valuable
 * attacker, after which each side may stop recapturing. Null if no capture exists.
 * Attackers are tried with move()/undo() in value order: illegal ones (pinned) throw,
 * and no other moves are generated, which keeps this cheap enough to run every ply.
 */
function forcedExchange(chess: Chess, square: Square): number | null {
  const target = chess.get(square);
  if (!target) return null;
  const promotes = square[1] === '8' || square[1] === '1';
  const attackers = chess
    .attackers(square, chess.turn())
    .map((from) => ({ from, type: chess.get(from)?.type ?? 'k' }))
    .sort((a, b) => PIECE_VALUE[a.type] - PIECE_VALUE[b.type]);

  for (const { from, type } of attackers) {
    const promotion = type === 'p' && promotes ? 'q' : undefined;
    try {
      chess.move({ from, to: square, promotion });
    } catch {
      continue; // pinned or otherwise illegal; try the next attacker
    }
    const gain = PIECE_VALUE[target.type] + (promotion ? PIECE_VALUE.q - PIECE_VALUE.p : 0);
    const reply = forcedExchange(chess, square);
    chess.undo();
    return gain - Math.max(0, reply ?? 0);
  }
  return null;
}

/** Static exchange evaluation of capturing on `square` for the side to move; 0 if no capture. */
export function see(fen: string, square: string): number {
  return forcedExchange(new Chess(fen), square as Square) ?? 0;
}

/** The side to move's best winning capture against `victim`'s pieces (kings excluded). */
function bestCaptureAgainst(chess: Chess, victim: Color): number {
  let best = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== victim || sq.type === 'k') continue;
      best = Math.max(best, forcedExchange(chess, sq.square) ?? 0);
    }
  }
  return best;
}

/** What the opponent could already win before the move, as if the mover passed. */
function alreadyEnPrise(fenBefore: string, mover: Color): number {
  const fields = fenBefore.trim().split(/\s+/);
  fields[1] = mover === 'w' ? 'b' : 'w';
  fields[3] = '-';
  try {
    return bestCaptureAgainst(new Chess(fields.join(' ')), mover);
  } catch {
    return 0; // a "passed" position chess.js refuses to load
  }
}

/**
 * True when the move gives up at least {@link SACRIFICE_THRESHOLD} pawns of material:
 * what it captures, minus how much more the opponent can win afterwards than before.
 * Material that was already lost (a fork, a pin) is not the move's sacrifice.
 */
export function isSacrifice(fenBefore: string, uci: string): boolean {
  const chess = new Chess(fenBefore);
  const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  const mover = move.color;

  let gained = move.captured ? PIECE_VALUE[move.captured] : 0;
  if (move.promotion) gained += PIECE_VALUE[move.promotion] - PIECE_VALUE.p;

  const exposed = bestCaptureAgainst(chess, mover) - alreadyEnPrise(fenBefore, mover);
  return gained - Math.max(0, exposed) <= -SACRIFICE_THRESHOLD;
}
