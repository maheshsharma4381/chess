import type { Color, EngineLine, MoveClassification, Score } from '@chess/types';
import { moverWin } from './math';

export interface ClassifyInput {
  color: Color;
  uci: string;
  isBook: boolean;
  legalMoveCount: number;
  /** Engine lines from the position before the move, best first, White POV. */
  lines: EngineLine[];
  /** Best evaluation of the position after the played move, White POV. */
  scoreAfter: Score;
  prevOpponentClass: MoveClassification | null;
  /** From isSacrifice(fenBefore, uci). */
  sacrifice: boolean;
  /** Captures on the square of the opponent's previous capture: forced, never "Great". */
  recapture?: boolean;
}

/** Spec thresholds and plan rulings R1-R3, R9. */
export const CLASSIFY = {
  brilliantMaxCpLoss: 15,
  brilliantMaxCpBefore: 400,
  brilliantMinWinAfter: 45,
  greatMinGap: 18,
  missMinWinDiff: 12,
  winningOrDrawnBefore: 40,
  lostAfter: 20,
  stillWinningAfterMissedMate: 70,
  excellent: 2,
  good: 5,
  inaccuracy: 10,
  mistake: 20,
} as const;

/** Mover-POV centipawns; mates map to ±Infinity. */
function moverCp(score: Score, color: Color): number {
  const sign = color === 'white' ? 1 : -1;
  if ('mate' in score) return score.mate * sign > 0 ? Infinity : -Infinity;
  return score.cp * sign;
}

/** Mover-POV mate sign: 1 = mover mates, -1 = mover gets mated, 0 = no mate. */
function mateFor(score: Score, color: Color): number {
  if (!('mate' in score)) return 0;
  return Math.sign(score.mate) * (color === 'white' ? 1 : -1);
}

function band(winDiff: number): MoveClassification {
  if (winDiff <= CLASSIFY.excellent) return 'excellent';
  if (winDiff <= CLASSIFY.good) return 'good';
  if (winDiff <= CLASSIFY.inaccuracy) return 'inaccuracy';
  if (winDiff <= CLASSIFY.mistake) return 'mistake';
  return 'blunder';
}

/** Engine verdicts that the opening book must not hide (the book contains trap lines). */
const BOOK_CANNOT_EXCUSE = new Set<MoveClassification>(['mistake', 'blunder', 'miss']);

/**
 * Precedence (plan R2, amended): Book → Brilliant → Great → Best → allows mate / drops to
 * lost (Blunder) → Miss → win% bands. A book move is Book unless the engine calls it a
 * Mistake, Blunder or Miss (Fool's Mate is "book"). A missed forced mate that keeps a
 * clearly winning position is capped at Mistake (R9).
 */
export function classifyMove(input: ClassifyInput): MoveClassification {
  const verdict = engineVerdict(input);
  if (input.isBook && !BOOK_CANNOT_EXCUSE.has(verdict)) return 'book';
  return verdict;
}

function engineVerdict(input: ClassifyInput): MoveClassification {
  const { color, lines, scoreAfter } = input;
  const best = lines[0];
  const winAfter = moverWin(scoreAfter, color);
  const winBefore = best ? moverWin(best.score, color) : winAfter;
  const winDiff = Math.max(0, winBefore - winAfter);
  const isBest = best?.uci === input.uci;
  const forced = input.legalMoveCount <= 1;

  if (best && !forced && input.sacrifice) {
    const cpLoss = moverCp(best.score, color) - moverCp(scoreAfter, color);
    const nearBest = isBest || cpLoss <= CLASSIFY.brilliantMaxCpLoss;
    if (
      nearBest &&
      moverCp(best.score, color) < CLASSIFY.brilliantMaxCpBefore &&
      winAfter >= CLASSIFY.brilliantMinWinAfter
    ) {
      return 'brilliant';
    }
  }

  const second = lines[1];
  if (isBest && !forced && second && !input.recapture) {
    if (moverWin(best.score, color) - moverWin(second.score, color) >= CLASSIFY.greatMinGap) {
      return 'great';
    }
  }
  if (isBest) return 'best';

  const allowsMate = mateFor(scoreAfter, color) < 0 && (!best || mateFor(best.score, color) >= 0);
  const dropsToLost = winBefore >= CLASSIFY.winningOrDrawnBefore && winAfter <= CLASSIFY.lostAfter;
  if (allowsMate || dropsToLost) return 'blunder';

  const punishable = input.prevOpponentClass === 'mistake' || input.prevOpponentClass === 'blunder';
  if (punishable && winDiff > CLASSIFY.missMinWinDiff) return 'miss';

  const result = band(winDiff);
  const missedMateStillWinning =
    best !== undefined &&
    mateFor(best.score, color) > 0 &&
    mateFor(scoreAfter, color) <= 0 &&
    winAfter >= CLASSIFY.stillWinningAfterMissedMate;
  return result === 'blunder' && missedMateStillWinning ? 'mistake' : result;
}
