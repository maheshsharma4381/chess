import { Chess } from 'chess.js';
import type { Color, GamePhase, PhaseAccuracy, Score } from '@chess/types';

/** Spec: Win% = 50 + 50 * (2 / (1 + e^(-0.00368208 * cp)) - 1). White POV; mate pins to 100/0. */
export function winPercent(score: Score): number {
  if ('mate' in score) return score.mate > 0 ? 100 : 0;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * score.cp)) - 1);
}

/** Win% for the given side. */
export function moverWin(score: Score, color: Color): number {
  const white = winPercent(score);
  return color === 'white' ? white : 100 - white;
}

/** Spec: clamp(103.1668 * e^(-0.04354 * winDiff) - 3.1669, 0, 100), mover POV. */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const winDiff = Math.max(0, winBefore - winAfter);
  return Math.min(100, Math.max(0, 103.1668 * Math.exp(-0.04354 * winDiff) - 3.1669));
}

const stdev = (xs: number[]) => {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
};

/**
 * Lichess-style volatility weights, one per ply: population stdev of sliding
 * win% windows, clamped to [0.5, 12]. The first windowSize - 2 plies reuse the
 * opening window so every ply gets a weight.
 */
function volatilityWeights(winGraph: number[]): number[] {
  const plies = winGraph.length - 1;
  if (plies <= 0) return [];
  const size = Math.min(8, Math.max(2, Math.floor(plies / 10)));
  const windows: number[][] = [];
  for (let i = 0; i < size - 2; i++) windows.push(winGraph.slice(0, size));
  for (let i = 0; i + size <= winGraph.length; i++) windows.push(winGraph.slice(i, i + size));
  return windows.slice(0, plies).map((w) => Math.min(12, Math.max(0.5, stdev(w))));
}

/** (weighted mean + harmonic mean) / 2 over the given plies; null when there are none. */
function blendedAccuracy(
  indices: number[],
  accuracies: number[],
  weights: number[],
): number | null {
  if (indices.length === 0) return null;
  let weighted = 0;
  let weightSum = 0;
  let inverseSum = 0;
  for (const i of indices) {
    const acc = accuracies[i] as number;
    const w = weights[i] as number;
    weighted += acc * w;
    weightSum += w;
    // Floor at 1 so one 0% move can't collapse the harmonic mean to 0.
    inverseSum += 1 / Math.max(1, acc);
  }
  return (weighted / weightSum + indices.length / inverseSum) / 2;
}

const pliesOf = (colors: Color[], color: Color, keep: (i: number) => boolean = () => true) =>
  colors.flatMap((c, i) => (c === color && keep(i) ? [i] : []));

/**
 * Overall accuracy per color. `winGraph` is White win% per position (plies + 1 values);
 * `accuracies[i]` and `colors[i]` describe ply i + 1. A side with no moves scores 100.
 */
export function gameAccuracy(
  winGraph: number[],
  accuracies: number[],
  colors: Color[],
): Record<Color, number> {
  const weights = volatilityWeights(winGraph);
  return {
    white: blendedAccuracy(pliesOf(colors, 'white'), accuracies, weights) ?? 100,
    black: blendedAccuracy(pliesOf(colors, 'black'), accuracies, weights) ?? 100,
  };
}

/** Accuracy per color and phase, weighted by whole-game volatility. Null where a side made no moves. */
export function phaseAccuracy(
  winGraph: number[],
  accuracies: number[],
  colors: Color[],
  phases: GamePhase[],
): Record<Color, PhaseAccuracy> {
  const weights = volatilityWeights(winGraph);
  const forColor = (color: Color): PhaseAccuracy => {
    const at = (phase: GamePhase) =>
      blendedAccuracy(
        pliesOf(colors, color, (i) => phases[i] === phase),
        accuracies,
        weights,
      );
    return { opening: at('opening'), middlegame: at('middlegame'), endgame: at('endgame') };
  };
  return { white: forColor('white'), black: forColor('black') };
}

const MINOR_OR_MAJOR = new Set(['n', 'b', 'r', 'q']);

/** Phase of the position reached at `ply` (0 = start). See plan ruling R6. */
export function phaseOf(fen: string, ply: number): GamePhase {
  const board = new Chess(fen).board();
  let pieces = 0;
  for (const row of board) for (const sq of row) if (sq && MINOR_OR_MAJOR.has(sq.type)) pieces++;
  if (pieces <= 6) return 'endgame';

  const ownOnRank = (rank: (typeof board)[number], color: 'w' | 'b') =>
    rank.filter((sq) => sq?.color === color).length;
  const sparseBackRank = ownOnRank(board[7] ?? [], 'w') < 4 || ownOnRank(board[0] ?? [], 'b') < 4;
  if (pieces <= 10 || sparseBackRank || ply > 30) return 'middlegame';
  return 'opening';
}

/** Typical accuracy by rating (calibration table; linear between points). */
const EXPECTED_ACCURACY: ReadonlyArray<readonly [elo: number, accuracy: number]> = [
  [100, 40],
  [400, 55],
  [800, 65],
  [1200, 72],
  [1600, 78],
  [2000, 83],
  [2400, 88],
  [2800, 92],
  [3200, 95],
];

const MIN_RATING = 100;
const MAX_RATING = 3200;

function interpolate(x: number, points: ReadonlyArray<readonly [number, number]>): number {
  const first = points[0] as readonly [number, number];
  const last = points[points.length - 1] as readonly [number, number];
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i] as readonly [number, number];
    const [x0, y0] = points[i - 1] as readonly [number, number];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
}

export function expectedAccuracy(elo: number): number {
  return interpolate(elo, EXPECTED_ACCURACY);
}

/**
 * Single-game performance rating. With a base rating: base + (accuracy - expected) * 18 (spec).
 * Without one: the rating whose expected accuracy matches. Clamped to 100..3200.
 */
export function estimateRating(accuracy: number, baseElo?: number): number {
  const raw =
    baseElo === undefined
      ? interpolate(
          accuracy,
          EXPECTED_ACCURACY.map(([elo, acc]) => [acc, elo] as const),
        )
      : baseElo + (accuracy - expectedAccuracy(baseElo)) * 18;
  return Math.round(Math.min(MAX_RATING, Math.max(MIN_RATING, raw)));
}
