import { describe, expect, it } from 'vitest';
import type { Color, GamePhase } from '@chess/types';
import {
  estimateRating,
  expectedAccuracy,
  gameAccuracy,
  moveAccuracy,
  moverWin,
  phaseAccuracy,
  phaseOf,
  winPercent,
} from '../src/index';

// Golden values computed independently from the spec formulas.
describe('winPercent', () => {
  it('maps centipawns through the spec sigmoid', () => {
    expect(winPercent({ cp: 0 })).toBe(50);
    expect(winPercent({ cp: 100 })).toBeCloseTo(59.10259, 4);
    expect(winPercent({ cp: -100 })).toBeCloseTo(40.89741, 4);
    expect(winPercent({ cp: 300 })).toBeCloseTo(75.11255, 4);
  });

  it('is symmetric around 50', () => {
    for (const cp of [7, 33, 150, 420, 999, 2500]) {
      expect(winPercent({ cp }) + winPercent({ cp: -cp })).toBeCloseTo(100, 9);
    }
  });

  it('pins mate scores to 100 and 0', () => {
    expect(winPercent({ mate: 3 })).toBe(100);
    expect(winPercent({ mate: -1 })).toBe(0);
  });

  it('flips to the mover perspective for Black', () => {
    expect(moverWin({ cp: 100 }, 'white')).toBeCloseTo(59.10259, 4);
    expect(moverWin({ cp: 100 }, 'black')).toBeCloseTo(40.89741, 4);
    expect(moverWin({ mate: 2 }, 'black')).toBe(0);
  });
});

describe('moveAccuracy', () => {
  it('follows the spec exponential', () => {
    expect(moveAccuracy(50, 50)).toBeCloseTo(99.9999, 4);
    expect(moveAccuracy(50, 40)).toBeCloseTo(63.582619, 4);
    expect(moveAccuracy(100, 0)).toBe(0);
  });

  it('never penalizes a move that improves the position', () => {
    expect(moveAccuracy(60, 70)).toBeCloseTo(99.9999, 4);
  });
});

describe('gameAccuracy', () => {
  const graph = [50, 50, 50, 30, 30];
  const colors: Color[] = ['white', 'black', 'white', 'black'];
  const accuracies = [99.9999, 99.9999, moveAccuracy(50, 30), 99.9999];

  it('combines the volatility-weighted and harmonic means per color', () => {
    const result = gameAccuracy(graph, accuracies, colors);
    expect(result.white).toBeCloseTo(50.0201, 3);
    expect(result.black).toBeCloseTo(99.9999, 3);
  });

  it('gives 100 to both sides for a perfect game', () => {
    const n = 24;
    const result = gameAccuracy(
      Array(n + 1).fill(50),
      Array(n).fill(99.9999),
      Array.from({ length: n }, (_, i): Color => (i % 2 ? 'black' : 'white')),
    );
    expect(result.white).toBeCloseTo(100, 3);
    expect(result.black).toBeCloseTo(100, 3);
  });

  it('handles games with zero or one ply', () => {
    expect(gameAccuracy([50], [], [])).toEqual({ white: 100, black: 100 });
    const onePly = gameAccuracy([50, 40], [63.58], ['white']);
    expect(onePly.white).toBeCloseTo(63.58, 9);
    expect(onePly.black).toBe(100);
  });

  it('does not collapse to 0 when a single move scores 0', () => {
    const result = gameAccuracy([50, 50, 0, 0], [99.9999, 0, 99.9999], ['white', 'black', 'white']);
    expect(result.black).toBeGreaterThan(0);
  });

  it('splits accuracy by game phase', () => {
    const phases: GamePhase[] = ['opening', 'opening', 'middlegame', 'middlegame'];
    const result = phaseAccuracy(graph, accuracies, colors, phases);
    expect(result.white.opening).toBeCloseTo(99.9999, 3);
    expect(result.white.middlegame).toBeCloseTo(40.0204, 3);
    expect(result.white.endgame).toBeNull();
    expect(result.black.endgame).toBeNull();
  });
});

describe('phaseOf', () => {
  it('starts in the opening', () => {
    expect(phaseOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 0)).toBe('opening');
  });

  it('is an endgame with 6 or fewer major and minor pieces', () => {
    expect(phaseOf('4k3/8/8/8/8/8/8/R3K2R w - - 0 40', 78)).toBe('endgame');
  });

  it('is a middlegame with 10 or fewer major and minor pieces', () => {
    expect(phaseOf('r1bqk2r/pppp1ppp/8/8/8/8/PPPP1PPP/R1BQK2R w KQkq - 0 10', 18)).toBe(
      'middlegame',
    );
  });

  it('is a middlegame once a back rank is sparse', () => {
    const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPPQ1PPP/R3K2R w KQkq - 0 7';
    expect(phaseOf(fen, 12)).toBe('middlegame');
  });

  it('is a middlegame after move 15 even with full material', () => {
    expect(phaseOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 31)).toBe(
      'middlegame',
    );
  });
});

describe('estimateRating', () => {
  it('equals the base rating at the expected accuracy', () => {
    expect(estimateRating(expectedAccuracy(1200), 1200)).toBe(1200);
  });

  it('adds 18 points per accuracy point above expectation', () => {
    expect(estimateRating(expectedAccuracy(1200) + 1, 1200)).toBe(1218);
    expect(estimateRating(expectedAccuracy(1600) - 5, 1600)).toBe(1510);
  });

  it('inverts the expectation table without a base rating', () => {
    expect(estimateRating(expectedAccuracy(1200))).toBe(1200);
    expect(estimateRating(expectedAccuracy(2000))).toBe(2000);
  });

  it('clamps to 100..3200', () => {
    expect(estimateRating(100)).toBe(3200);
    expect(estimateRating(5)).toBe(100);
    expect(estimateRating(0, 300)).toBe(100);
  });
});
