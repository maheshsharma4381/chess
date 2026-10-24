import { Chess } from 'chess.js';
import { normalizeEpd } from '@chess/chess-core';

export interface ReplayedLine {
  uci: string;
  sans: string[];
  plies: number;
  epd: string;
  /** EPD after each ply; the last element equals `epd`. */
  prefixEpds: string[];
}

const MOVE_NUMBER = /^\d+\.+/;
const RESULT = /^(1-0|0-1|1\/2-1\/2|\*)$/;

/** Plays SAN movetext from the start position. Throws on the first illegal move. */
export function replayPgn(pgn: string): ReplayedLine {
  const chess = new Chess();
  const uci: string[] = [];
  const sans: string[] = [];
  const prefixEpds: string[] = [];

  for (const token of pgn.trim().split(/\s+/)) {
    const san = token.replace(MOVE_NUMBER, '');
    if (!san || RESULT.test(san)) continue;

    let move;
    try {
      move = chess.move(san);
    } catch {
      throw new Error(`Illegal move "${san}" at ply ${sans.length + 1} in "${pgn}"`);
    }
    uci.push(move.from + move.to + (move.promotion ?? ''));
    sans.push(move.san);
    prefixEpds.push(normalizeEpd(chess.fen()));
  }

  return {
    uci: uci.join(' '),
    sans,
    plies: sans.length,
    epd: prefixEpds.at(-1) ?? normalizeEpd(chess.fen()),
    prefixEpds,
  };
}
