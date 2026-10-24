import { Chess } from 'chess.js';
import type { AnalysisLine } from '@/lib/analysis/line';

const START_FEN = new Chess().fen();

/** chess.js leaves Result at "*" even after mate, so the result is worked out here. */
function resultOf(chess: Chess): '1-0' | '0-1' | '1/2-1/2' | '*' {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? '0-1' : '1-0';
  if (chess.isDraw() || chess.isStalemate()) return '1/2-1/2';
  return '*';
}

/** A complete PGN (Seven Tag Roster, SetUp/FEN for a custom start, and the result). */
export function linePgn(line: AnalysisLine, headers: Record<string, string> = {}): string {
  const chess = new Chess(line.startFen);
  for (const san of line.sans) chess.move(san);
  for (const [name, value] of Object.entries(headers)) chess.setHeader(name, value);
  if (line.startFen !== START_FEN) {
    chess.setHeader('SetUp', '1');
    chess.setHeader('FEN', line.startFen);
  }
  chess.setHeader('Result', headers['Result'] ?? resultOf(chess));
  return chess.pgn();
}
