import { Chess } from 'chess.js';
import { parsePgn } from '@chess/chess-core';
import { positionFromFen, validateEditorPosition } from './editor';

/** The analysis board's game: a start position and the main line (Phase 3 has no variations). */
export interface AnalysisLine {
  startFen: string;
  sans: string[];
}

export type ImportResult = { ok: true; line: AnalysisLine } | { ok: false; error: string };

const START_FEN = new Chess().fen();
const FEN_SHAPE = /^[1-8pnbrqkPNBRQK]+(\/[1-8pnbrqkPNBRQK]+){7}(\s|$)/;

/** chess.js validates the FEN fields and the kings; the editor's rules add the rest. */
function loadFen(fen: string): { ok: true; chess: Chess } | { ok: false; error: string } {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const problem = validateEditorPosition(positionFromFen(fen));
  return problem ? { ok: false, error: problem } : { ok: true, chess };
}

/** Accepts a FEN or a PGN (with or without headers), the way the import box is used. */
export function importGame(text: string): ImportResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Paste a FEN or a PGN.' };

  if (FEN_SHAPE.test(trimmed)) {
    const loaded = loadFen(trimmed);
    if (!loaded.ok) return loaded;
    return { ok: true, line: { startFen: loaded.chess.fen(), sans: [] } };
  }

  const parsed = parsePgn(trimmed);
  const loaded = loadFen(parsed.startFen ?? START_FEN);
  if (!loaded.ok) return loaded;
  const { chess } = loaded;
  const startFen = chess.fen();
  const sans: string[] = [];
  for (const san of parsed.sans) {
    const number = `${chess.moveNumber()}${chess.turn() === 'w' ? '.' : '...'}`;
    try {
      sans.push(chess.move(san).san);
    } catch {
      return { ok: false, error: `Illegal move ${number} ${san}.` };
    }
  }
  return { ok: true, line: { startFen, sans } };
}

/** The position after each ply, starting with the start position. */
export function fensOf(line: AnalysisLine): string[] {
  const chess = new Chess(line.startFen);
  return [chess.fen(), ...line.sans.map((san) => chess.move(san).after)];
}

/**
 * Plays `uci` from the position at `ply`. A different move replaces everything after that
 * ply; the move already next in the line keeps the line as it is. Null when illegal.
 */
export function playUci(line: AnalysisLine, ply: number, uci: string): AnalysisLine | null {
  const chess = new Chess(fensOf(line)[ply]);
  let san: string;
  try {
    san = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return null;
  }
  if (line.sans[ply] === san) return line;
  return { startFen: line.startFen, sans: [...line.sans.slice(0, ply), san] };
}
