import { describe, expect, it } from 'vitest';
import { DEFAULT_GLICKO2, GLICKO2_MAX_RD, updateGlicko2 } from '../src/index';

describe('updateGlicko2', () => {
  it("reproduces Glickman's worked example", () => {
    const updated = updateGlicko2({ rating: 1500, rd: 200, volatility: 0.06 }, [
      { opponent: { rating: 1400, rd: 30, volatility: 0.06 }, score: 1 },
      { opponent: { rating: 1550, rd: 100, volatility: 0.06 }, score: 0 },
      { opponent: { rating: 1700, rd: 300, volatility: 0.06 }, score: 0 },
    ]);
    expect(updated.rating).toBeCloseTo(1464.06, 1);
    expect(updated.rd).toBeCloseTo(151.52, 1);
    // The paper prints 0.05999 (truncated); reference implementations give 0.0599960.
    expect(updated.volatility).toBeCloseTo(0.059996, 6);
  });

  it('only grows the deviation when the player has no games in the period', () => {
    const player = { rating: 1620, rd: 80, volatility: 0.06 };
    const updated = updateGlicko2(player, []);
    const phi = 80 / 173.7178;
    expect(updated.rating).toBe(1620);
    expect(updated.volatility).toBe(0.06);
    expect(updated.rd).toBeCloseTo(Math.sqrt(phi ** 2 + 0.06 ** 2) * 173.7178, 6);
  });

  it('caps the deviation at the default for new players', () => {
    expect(GLICKO2_MAX_RD).toBe(350);
    expect(updateGlicko2({ rating: 1500, rd: 350, volatility: 0.06 }, []).rd).toBe(350);
    expect(DEFAULT_GLICKO2).toEqual({ rating: 1500, rd: 350, volatility: 0.06 });
  });

  it('moves the rating symmetrically for a win and a loss against an equal opponent', () => {
    const win = updateGlicko2(DEFAULT_GLICKO2, [{ opponent: DEFAULT_GLICKO2, score: 1 }]);
    const loss = updateGlicko2(DEFAULT_GLICKO2, [{ opponent: DEFAULT_GLICKO2, score: 0 }]);
    expect(win.rating).toBeGreaterThan(1500);
    expect(win.rating - 1500).toBeCloseTo(1500 - loss.rating, 9);
  });

  it('leaves the rating unchanged after a draw against an equal opponent', () => {
    const draw = updateGlicko2(DEFAULT_GLICKO2, [{ opponent: DEFAULT_GLICKO2, score: 0.5 }]);
    expect(draw.rating).toBeCloseTo(1500, 9);
    expect(draw.rd).toBeLessThan(350);
  });
});
