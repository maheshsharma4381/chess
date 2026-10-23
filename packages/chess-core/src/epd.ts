import { Chess } from 'chess.js';

/**
 * Canonical EPD key: the first 4 FEN fields, with the en passant square kept
 * only when a legal en passant capture exists (python-chess `epd()` semantics,
 * which the Lichess opening data uses). FENs from different sources then map
 * to the same book key.
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

  const [placement, turn, castling] = chess.fen().split(' ');
  const epMove = chess.moves({ verbose: true }).find((m) => m.isEnPassant());
  return `${placement} ${turn} ${castling} ${epMove ? epMove.to : '-'}`;
}
