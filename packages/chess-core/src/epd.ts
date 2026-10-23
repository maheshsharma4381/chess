import { Chess } from 'chess.js';

/**
 * Canonical EPD key: the first 4 FEN fields, with the en passant square kept
 * only when a legal en passant capture exists (python-chess `epd()` semantics,
 * which the Lichess opening data uses). chess.js 1.4 `fen()` already applies that
 * rule (including pins); the pinned-pawn test guards it across upgrades.
 */
export function normalizeEpd(fen: string): string {
  const fields = fen.trim().split(/\s+/);
  const fullFen = fields.length === 4 ? `${fields.join(' ')} 0 1` : fields.join(' ');

  let chess: Chess;
  try {
    chess = new Chess(fullFen);
  } catch (err) {
    throw new Error(`Invalid FEN "${fen}": ${(err as Error).message}`, { cause: err });
  }
  return chess.fen().split(' ').slice(0, 4).join(' ');
}
