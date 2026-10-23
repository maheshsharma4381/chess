import { describe, expect, it } from 'vitest';
import { CLASSIFICATION_META, MOVE_CLASSIFICATIONS } from '../src/index';

describe('CLASSIFICATION_META', () => {
  it('covers exactly the 10 move classifications', () => {
    expect(MOVE_CLASSIFICATIONS).toHaveLength(10);
    expect(Object.keys(CLASSIFICATION_META).sort()).toEqual([...MOVE_CLASSIFICATIONS].sort());
  });

  it('uses the spec badge colors', () => {
    const colors = Object.fromEntries(
      MOVE_CLASSIFICATIONS.map((c) => [c, CLASSIFICATION_META[c].color]),
    );
    expect(colors).toEqual({
      brilliant: '#1baca6',
      great: '#5c8bb0',
      best: '#81b64c',
      excellent: '#96bc4b',
      good: '#96af8b',
      book: '#a88865',
      inaccuracy: '#f7c631',
      mistake: '#e58f2a',
      miss: '#ff7769',
      blunder: '#ca3431',
    });
  });

  it('uses the spec badge symbols', () => {
    const symbols = Object.fromEntries(
      MOVE_CLASSIFICATIONS.map((c) => [c, CLASSIFICATION_META[c].symbol]),
    );
    expect(symbols).toEqual({
      brilliant: '!!',
      great: '!',
      best: '★',
      excellent: '👍',
      good: '✓',
      book: '📖',
      inaccuracy: '?!',
      mistake: '?',
      miss: '✖',
      blunder: '??',
    });
  });
});
