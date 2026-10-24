import { describe, expect, it } from 'vitest';
import type { Color, EngineLine, MoveClassification, Score } from '@chess/types';
import { classifyMove, type ClassifyInput } from '../src/index';

const line = (uci: string, score: Score): EngineLine => ({ uci, pv: [uci], score, depth: 18 });

/** White-POV cp that gives `color` the requested win%. Inverse of the spec sigmoid. */
const cpFor = (moverWinPct: number, color: Color) => {
  const cp = Math.log(moverWinPct / (100 - moverWinPct)) / 0.00368208;
  return color === 'white' ? cp : -cp;
};

const base = (overrides: Partial<ClassifyInput>): ClassifyInput => ({
  color: 'white',
  uci: 'e2e4',
  isBook: false,
  legalMoveCount: 20,
  lines: [line('e2e4', { cp: 30 }), line('d2d4', { cp: 20 }), line('g1f3', { cp: 10 })],
  scoreAfter: { cp: 30 },
  prevOpponentClass: null,
  sacrifice: false,
  ...overrides,
});

/** A non-best move that loses exactly `winDiff` win% points for `color`, from an equal position. */
const losing = (winDiff: number, color: Color = 'white', extra: Partial<ClassifyInput> = {}) =>
  classifyMove(
    base({
      color,
      uci: 'a2a3',
      lines: [line('e2e4', { cp: 0 }), line('d2d4', { cp: 0 })],
      scoreAfter: { cp: cpFor(50 - winDiff, color) },
      ...extra,
    }),
  );

describe('classifyMove precedence', () => {
  it('labels book moves Book regardless of evaluation', () => {
    expect(classifyMove(base({ isBook: true, uci: 'a2a3', scoreAfter: { cp: -900 } }))).toBe(
      'book',
    );
  });

  it('labels an engine-best move Best', () => {
    expect(classifyMove(base({}))).toBe('best');
    expect(
      classifyMove(
        base({
          color: 'black',
          uci: 'e7e5',
          lines: [line('e7e5', { cp: -20 }), line('c7c5', { cp: -10 })],
          scoreAfter: { cp: -20 },
        }),
      ),
    ).toBe('best');
  });
});

describe('Brilliant', () => {
  const sac = (overrides: Partial<ClassifyInput>) =>
    classifyMove(base({ sacrifice: true, ...overrides }));

  it('needs a sound sacrifice that is the best move', () => {
    expect(sac({ lines: [line('e2e4', { cp: 50 })], scoreAfter: { cp: 50 } })).toBe('brilliant');
  });

  it('accepts a sacrifice within 15 cp of the best move', () => {
    const lines = [line('d2d4', { cp: 50 }), line('e2e4', { cp: 36 })];
    expect(sac({ lines, scoreAfter: { cp: 36 } })).toBe('brilliant');
    expect(sac({ lines, scoreAfter: { cp: 34 } })).not.toBe('brilliant');
  });

  it('works for Black', () => {
    expect(
      sac({
        color: 'black',
        uci: 'f6e4',
        lines: [line('f6e4', { cp: -80 })],
        scoreAfter: { cp: -80 },
      }),
    ).toBe('brilliant');
  });

  it('is not awarded when already completely winning (>= +400 cp)', () => {
    expect(sac({ lines: [line('e2e4', { cp: 450 })], scoreAfter: { cp: 450 } })).toBe('best');
  });

  it('is not awarded when the position is worse than equal afterwards', () => {
    expect(sac({ lines: [line('e2e4', { cp: -100 })], scoreAfter: { cp: -100 } })).toBe('best');
  });

  it('is never awarded for the only legal move', () => {
    expect(
      sac({ legalMoveCount: 1, lines: [line('e2e4', { cp: 50 })], scoreAfter: { cp: 50 } }),
    ).toBe('best');
  });
});

describe('Great', () => {
  it('rewards finding the only good move (gap >= 18 win%)', () => {
    const lines = [line('e2e4', { cp: 300 }), line('d2d4', { cp: -50 })];
    expect(classifyMove(base({ lines, scoreAfter: { cp: 300 } }))).toBe('great');
  });

  it('is Best when the gap is 17', () => {
    const second = cpFor(75.11255 - 17, 'white');
    const lines = [line('e2e4', { cp: 300 }), line('d2d4', { cp: second })];
    expect(classifyMove(base({ lines, scoreAfter: { cp: 300 } }))).toBe('best');
  });

  it('works for Black', () => {
    const lines = [line('e7e5', { cp: -300 }), line('c7c5', { cp: 50 })];
    expect(
      classifyMove(base({ color: 'black', uci: 'e7e5', lines, scoreAfter: { cp: -300 } })),
    ).toBe('great');
  });

  it('needs a second line and more than one legal move', () => {
    expect(
      classifyMove(base({ lines: [line('e2e4', { cp: 300 })], scoreAfter: { cp: 300 } })),
    ).toBe('best');
    const lines = [line('e2e4', { cp: 300 }), line('d2d4', { cp: -50 })];
    expect(classifyMove(base({ lines, legalMoveCount: 1, scoreAfter: { cp: 300 } }))).toBe('best');
  });
});

describe('Blunder by mate', () => {
  it('is a Blunder to allow a forced mate even when the win% drop is small', () => {
    const lines = [line('e2e4', { cp: -400 })];
    expect(classifyMove(base({ uci: 'a2a3', lines, scoreAfter: { mate: -5 } }))).toBe('blunder');
    const black = [line('e7e5', { cp: 400 })];
    expect(
      classifyMove(base({ color: 'black', uci: 'a7a6', lines: black, scoreAfter: { mate: 5 } })),
    ).toBe('blunder');
  });

  it('is not a Blunder when the mate was already unavoidable', () => {
    const lines = [line('e2e4', { mate: -3 })];
    expect(classifyMove(base({ uci: 'a2a3', lines, scoreAfter: { mate: -2 } }))).toBe('excellent');
  });

  it('caps a missed mate at Mistake while the position stays clearly winning', () => {
    const lines = [line('e2e4', { mate: 3 })];
    expect(classifyMove(base({ uci: 'a2a3', lines, scoreAfter: { cp: 250 } }))).toBe('mistake');
    const black = [line('e7e5', { mate: -3 })];
    expect(
      classifyMove(base({ color: 'black', uci: 'a7a6', lines: black, scoreAfter: { cp: -250 } })),
    ).toBe('mistake');
  });

  it('still calls a missed mate a Blunder when the advantage is thrown away', () => {
    const lines = [line('e2e4', { mate: 3 })];
    expect(classifyMove(base({ uci: 'a2a3', lines, scoreAfter: { cp: 0 } }))).toBe('blunder');
  });
});

describe('Miss', () => {
  it("is a Miss to not punish the opponent's mistake (winDiff > 12)", () => {
    expect(losing(13, 'white', { prevOpponentClass: 'blunder' })).toBe('miss');
    expect(losing(25, 'black', { prevOpponentClass: 'mistake' })).toBe('miss');
  });

  it('needs the previous move to be a Mistake or Blunder', () => {
    expect(losing(13, 'white', { prevOpponentClass: 'good' })).toBe('mistake');
    expect(losing(13, 'white', { prevOpponentClass: 'inaccuracy' })).toBe('mistake');
  });

  it('needs a real drop', () => {
    expect(losing(11, 'white', { prevOpponentClass: 'blunder' })).toBe('mistake');
  });
});

describe('win% bands', () => {
  const cases: Array<[number, MoveClassification]> = [
    [0, 'excellent'],
    [1.99, 'excellent'],
    [2.01, 'good'],
    [4.99, 'good'],
    [5.01, 'inaccuracy'],
    [9.99, 'inaccuracy'],
    [10.01, 'mistake'],
    [19.99, 'mistake'],
    [20.01, 'blunder'],
  ];

  it.each(cases)('winDiff %f -> %s (White)', (winDiff, expected) => {
    expect(losing(winDiff, 'white')).toBe(expected);
  });

  it.each(cases)('winDiff %f -> %s (Black)', (winDiff, expected) => {
    expect(losing(winDiff, 'black')).toBe(expected);
  });
});
