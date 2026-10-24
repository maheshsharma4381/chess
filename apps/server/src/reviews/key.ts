import { createHash } from 'node:crypto';
import { Chess, type Move } from 'chess.js';
import { parsePgn } from '@chess/chess-core';
import { HttpError } from '../http/errors';

export interface ReplayedGame {
  /** sha256 of the start position and the moves: the review cache key. */
  key: string;
  /** Normalized FEN when the game does not start from the initial position. */
  startFen: string | undefined;
  sans: string[];
  /** The game replayed to its last move. */
  chess: Chess;
  moves: Move[];
}

const INITIAL_FEN = new Chess().fen();

/**
 * Replays a PGN and derives its review cache key. Headers, comments and annotations do not
 * change the key; the start position does. Throws a 400 naming an illegal move.
 */
export function reviewKey(pgn: string): ReplayedGame {
  const parsed = parsePgn(pgn);
  let chess: Chess;
  try {
    chess = new Chess(parsed.startFen ?? INITIAL_FEN);
  } catch (err) {
    throw new HttpError(400, `Invalid start position: ${(err as Error).message}`);
  }
  const start = chess.fen();
  const moves: Move[] = [];
  for (const san of parsed.sans) {
    const label = `${chess.moveNumber()}${chess.turn() === 'w' ? '.' : '...'} ${san}`;
    try {
      moves.push(chess.move(san));
    } catch {
      throw new HttpError(400, `Illegal move ${label}`);
    }
  }
  const sans = moves.map((m) => m.san);
  const key = createHash('sha256')
    .update(`${start}\n${sans.join(' ')}`)
    .digest('hex');
  return { key, startFen: start === INITIAL_FEN ? undefined : start, sans, chess, moves };
}
