import { Chess, type Move } from 'chess.js';
import {
  MOVE_CLASSIFICATIONS,
  type AbortSignalLike,
  type BookOpening,
  type Color,
  type EngineLine,
  type GamePhase,
  type MoveClassification,
  type MoveRef,
  type MoveReview,
  type OpeningEntry,
  type ReviewReport,
  type Score,
} from '@chess/types';
import { throwIfAborted, timers } from '../abort';
import { isSacrifice } from '../board/material';
import { detectMotifs } from '../coach/tacticalMotifDetector';
import type { OpeningLookupService } from '../opening/OpeningLookupService';
import { classifyMove } from './classify';
import {
  estimateRating,
  gameAccuracy,
  moveAccuracy,
  moverWin,
  phaseAccuracy,
  phaseOf,
  winPercent,
} from './math';

/** Any UCI engine (Stockfish WASM worker, native process, remote service). */
export interface EngineAdapter {
  /**
   * Lines best first. Scores are from the SIDE TO MOVE's point of view, as UCI reports them.
   * Must return at least one line for a position with legal moves.
   */
  analyse(
    fen: string,
    opts: { depth: number; multiPv: number; signal?: AbortSignalLike },
  ): Promise<EngineLine[]>;
}

export type GameInput = { pgn: string } | { sans: string[]; startFen?: string };

export interface AnalyzeOptions {
  /** Spec: depth 16-18. */
  depth?: number;
  /** Spec: MultiPV 3. */
  multiPv?: number;
  /** Players' ratings, used for the estimated game rating. */
  baseElo?: Partial<Record<Color, number>>;
  /** Called after each position: done goes 1..total, total = plies + 1. */
  onProgress?: (done: number, total: number) => void;
  /** Aborting stops engine work and rejects with AbortError. */
  signal?: AbortSignalLike;
}

const PV_SAN_LENGTH = 6;
/** Below this many non-book moves a side gets no estimated rating (Scholar's mate isn't 3200). */
export const MIN_MOVES_FOR_RATING = 8;

/**
 * Lets the browser render, React Native handle gestures, or a Node server serve sockets
 * between plies; the per-move work is tens of milliseconds each.
 */
const yieldToEventLoop = () =>
  new Promise<void>((resolve) => {
    if (timers.set(resolve, 0) === undefined) resolve();
  });
const RESULT = /^(1-0|0-1|1\/2-1\/2|\*)$/;

/**
 * Extracts the start FEN and mainline SAN moves of the first game: header lines, comments,
 * variations and NAGs are removed, and parsing stops at the first result token.
 */
export function parsePgn(pgn: string): { startFen?: string; sans: string[] } {
  const startFen = /^\s*\[FEN\s+"([^"]+)"\]\s*$/m.exec(pgn)?.[1];
  let text = pgn
    .replace(/^\s*\[.*\]\s*$/gm, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n]*/g, ' ');
  for (let prev = ''; prev !== text;) {
    prev = text;
    text = text.replace(/\([^()]*\)/g, ' ');
  }

  const sans: string[] = [];
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^\d+\.+/, '').replace(/[!?]+$/, '');
    if (RESULT.test(token)) break;
    if (token && !/^\$\d+$/.test(token)) sans.push(token);
  }
  return startFen ? { startFen, sans } : { sans };
}

function replay(startFen: string | undefined, sans: string[]): { start: string; moves: Move[] } {
  const chess = startFen ? new Chess(startFen) : new Chess();
  const start = chess.fen();
  const moves = sans.map((san, i) => {
    try {
      return chess.move(san);
    } catch {
      throw new Error(`Illegal move "${san}" at ply ${i + 1}`);
    }
  });
  return { start, moves };
}

const toWhitePov = (score: Score, whiteToMove: boolean): Score => {
  if (whiteToMove) return score;
  return 'mate' in score ? { mate: -score.mate } : { cp: -score.cp };
};

/** Evaluation of a finished position, or null if the engine is needed (plan ruling R8). */
function terminalScore(fen: string): Score | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return { mate: chess.turn() === 'w' ? -1 : 1 };
  if (chess.isDraw()) return { cp: 0 };
  return null;
}

function uciToSan(fen: string, ucis: string[], max: number): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of ucis.slice(0, max)) {
    try {
      out.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san);
    } catch {
      break;
    }
  }
  return out;
}

const moveRef = (fen: string, line: EngineLine | undefined): MoveRef | null => {
  if (!line) return null;
  const san = uciToSan(fen, [line.uci], 1)[0];
  return san ? { uci: line.uci, san } : null;
};

const asBookOpening = (entry: OpeningEntry, lastBookPly: number): BookOpening => ({
  eco: entry.eco,
  name: entry.name,
  pgn: entry.pgn,
  lastBookPly,
});

function emptyCounts(): Record<MoveClassification, number> {
  return Object.fromEntries(MOVE_CLASSIFICATIONS.map((c) => [c, 0])) as Record<
    MoveClassification,
    number
  >;
}

/**
 * Full Game Review: engine analysis of every position, opening book, per-move
 * classification, accuracy, motifs, and per-color summaries.
 */
export async function analyzeGame(
  input: GameInput,
  deps: { engine: EngineAdapter; book: OpeningLookupService },
  options: AnalyzeOptions = {},
): Promise<ReviewReport> {
  const { depth = 18, multiPv = 3, baseElo = {}, onProgress, signal } = options;
  throwIfAborted(signal);
  const parsed = 'pgn' in input ? parsePgn(input.pgn) : input;
  const { start, moves } = replay(parsed.startFen, parsed.sans);
  const fens = [start, ...moves.map((m) => m.after)];

  // 1. Engine pass, one position at a time (engines are single-threaded).
  const lines: EngineLine[][] = [];
  const scores: Score[] = [];
  for (const [i, fen] of fens.entries()) {
    const terminal = terminalScore(fen);
    if (terminal) {
      lines.push([]);
      scores.push(terminal);
    } else {
      throwIfAborted(signal);
      const whiteToMove = fen.split(' ')[1] === 'w';
      const raw = await deps.engine.analyse(fen, { depth, multiPv, signal });
      throwIfAborted(signal);
      const converted = raw.map((l) => ({ ...l, score: toWhitePov(l.score, whiteToMove) }));
      const best = converted[0];
      if (!best) throw new Error(`Engine returned no lines for a live position: ${fen}`);
      lines.push(converted);
      scores.push(best.score);
    }
    onProgress?.(i + 1, fens.length);
  }

  // 2. Opening book.
  const track = deps.book.trackGameOpening(fens);

  // 3. Per-move review.
  const reviews: MoveReview[] = [];
  let named: OpeningEntry | null = null;
  for (const [i, move] of moves.entries()) {
    await yieldToEventLoop();
    throwIfAborted(signal);
    const ply = i + 1;
    const color: Color = move.color === 'w' ? 'white' : 'black';
    const fenBefore = fens[i] as string;
    const fenAfter = fens[ply] as string;
    const before = lines[i] ?? [];
    const scoreBefore = before[0]?.score ?? (scores[i] as Score);
    const scoreAfter = scores[ply] as Score;
    const isBook = track.bookPlies[i] ?? false;
    if (isBook) named = deps.book.getOpeningByFen(fenAfter) ?? named;

    const uci = move.from + move.to + (move.promotion ?? '');
    const sacrifice = !isBook && isSacrifice(fenBefore, uci);
    const classification = classifyMove({
      color,
      uci,
      isBook,
      legalMoveCount: new Chess(fenBefore).moves().length,
      lines: before,
      scoreAfter,
      prevOpponentClass: reviews[i - 1]?.classification ?? null,
      sacrifice,
      recapture: Boolean(move.captured && moves[i - 1]?.captured && moves[i - 1]?.to === move.to),
    });

    let deviation: { bestBookSan: string } | null = null;
    if (ply === track.deviationPly) {
      const theory = deps.book.bookMovesFrom(fenBefore);
      const pick =
        theory.find((t) => t.uci === before[0]?.uci) ?? theory.find((t) => t.opening) ?? theory[0];
      if (pick) deviation = { bestBookSan: pick.san };
    }

    const winBefore = moverWin(scoreBefore, color);
    const winAfter = moverWin(scoreAfter, color);
    reviews.push({
      ply,
      color,
      san: move.san,
      uci,
      fenBefore,
      fenAfter,
      classification,
      accuracy: classification === 'book' ? 100 : moveAccuracy(winBefore, winAfter),
      winBefore,
      winAfter,
      scoreBefore,
      scoreAfter,
      bestMove: moveRef(fenBefore, before[0]),
      secondBestMove: moveRef(fenBefore, before[1]),
      pv: uciToSan(fenBefore, before[0]?.pv ?? [], PV_SAN_LENGTH),
      isBook,
      phase: phaseOf(fenAfter, ply),
      motifs: detectMotifs({
        fenBefore,
        uci,
        ply,
        bestLine: before[0]?.pv ?? [],
        replyLine: lines[ply]?.[0]?.pv ?? [],
        scoreAfter,
        isBook,
        bookOpening: named ? asBookOpening(named, ply) : null,
        deviation,
        sacrifice,
      }),
    });
  }

  // 4. Summaries.
  const winGraph = scores.map(winPercent);
  const accuracies = reviews.map((r) => r.accuracy);
  const colors = reviews.map((r) => r.color);
  const phases: GamePhase[] = reviews.map((r) => r.phase);
  const accuracy = gameAccuracy(winGraph, accuracies, colors);
  const counts = { white: emptyCounts(), black: emptyCounts() };
  for (const r of reviews) counts[r.color][r.classification]++;
  const enoughMoves = (color: Color) =>
    reviews.filter((r) => r.color === color && r.classification !== 'book').length >=
    MIN_MOVES_FOR_RATING;

  return {
    moves: reviews,
    accuracy,
    phaseAccuracy: phaseAccuracy(winGraph, accuracies, colors, phases),
    estimatedRating: {
      white: enoughMoves('white') ? estimateRating(accuracy.white, baseElo.white) : null,
      black: enoughMoves('black') ? estimateRating(accuracy.black, baseElo.black) : null,
    },
    counts,
    opening: track.opening,
    winGraph,
  };
}
