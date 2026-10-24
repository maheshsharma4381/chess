import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { isSacrifice, majorsAndMinors, materialBalance, see } from '../src/index';

const START = new Chess().fen();
const fenAfter = (sans: string) => {
  const chess = new Chess();
  for (const san of sans.split(' ')) chess.move(san);
  return chess.fen();
};

describe('materialBalance / majorsAndMinors', () => {
  it('is level at the start with 14 major and minor pieces', () => {
    expect(materialBalance(START)).toBe(0);
    expect(majorsAndMinors(START)).toBe(14);
  });

  it('counts a won pawn for White', () => {
    expect(materialBalance(fenAfter('e4 d5 exd5'))).toBe(1);
  });
});

describe('see', () => {
  it('scores a hanging queen won by a pawn', () => {
    expect(see('4k3/8/8/8/1q6/P7/8/4K3 w - - 0 1', 'b4')).toBe(9);
  });

  it('is negative when a knight takes a pawn defended by a pawn', () => {
    expect(see('4k3/8/2p5/3p4/8/4N3/8/4K3 w - - 0 1', 'd5')).toBe(-2);
  });

  it('lets the defender stop recapturing when it would lose material', () => {
    // Rxd5 wins the pawn; Black's queen should not recapture into Rxd5.
    expect(see('3qk3/8/8/3p4/8/8/3R4/3RK3 w - - 0 1', 'd5')).toBe(1);
  });

  it('is 0 when nothing can capture on the square', () => {
    expect(see(START, 'e5')).toBe(0);
  });
});

describe('isSacrifice', () => {
  it("detects Legal's mate: Nxe5 leaves the queen en prise", () => {
    expect(isSacrifice(fenAfter('e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6'), 'f3e5')).toBe(true);
  });

  it('detects an exchange sacrifice where the king recaptures', () => {
    // Rxf7: rook takes a pawn defended by the king.
    expect(isSacrifice('6k1/5p2/8/8/8/8/8/5RK1 w - - 0 1', 'f1f7')).toBe(true);
  });

  it('is false for a quiet pawn push', () => {
    expect(isSacrifice(START, 'e2e4')).toBe(false);
  });

  it('is false for capturing a hanging piece', () => {
    expect(isSacrifice('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1', 'd1d5')).toBe(false);
  });

  it('is false for a one-pawn gambit', () => {
    expect(isSacrifice(fenAfter('d4 d5'), 'c2c4')).toBe(false);
  });

  it('is false for an even trade', () => {
    expect(isSacrifice(fenAfter('e4 e5 Nf3 Nc6 Bb5 a6'), 'b5c6')).toBe(false);
  });
});
