import type { MoveClassification } from './classification';
import type { Motif } from './coach';
import type { BookOpening } from './opening';

export type Color = 'white' | 'black';

/** Engine score from White's point of view. `mate` is signed: positive means White mates. */
export type Score = { cp: number } | { mate: number };

export interface EngineLine {
  /** First move of the line, UCI. */
  uci: string;
  /** Principal variation in UCI, starting with `uci`. */
  pv: string[];
  /** White POV inside chess-core. Engine adapters report side-to-move POV; the pipeline converts. */
  score: Score;
  depth: number;
}

export type GamePhase = 'opening' | 'middlegame' | 'endgame';

export interface PhaseAccuracy {
  opening: number | null;
  middlegame: number | null;
  endgame: number | null;
}

export interface MoveRef {
  uci: string;
  san: string;
}

export interface MoveReview {
  /** 1-based half-move number. */
  ply: number;
  color: Color;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  classification: MoveClassification;
  accuracy: number;
  /** Mover's win% before (best line) and after the played move. */
  winBefore: number;
  winAfter: number;
  /** White POV. */
  scoreBefore: Score;
  scoreAfter: Score;
  bestMove: MoveRef | null;
  secondBestMove: MoveRef | null;
  /** Best line from fenBefore in SAN, at most 6 moves. */
  pv: string[];
  isBook: boolean;
  phase: GamePhase;
  motifs: Motif[];
}

export interface ReviewReport {
  /** Position before the first move (from the PGN's FEN header, or the standard start). */
  startFen: string;
  moves: MoveReview[];
  accuracy: Record<Color, number>;
  phaseAccuracy: Record<Color, PhaseAccuracy>;
  /** Null when a side made too few non-book moves for a meaningful estimate. */
  estimatedRating: Record<Color, number | null>;
  counts: Record<Color, Record<MoveClassification, number>>;
  opening: BookOpening | null;
  /** White win% for every position, starting position first (length = plies + 1). */
  winGraph: number[];
}
