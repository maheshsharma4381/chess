import { describe, expect, it } from 'vitest';
import { CHESS960_STANDARD_INDEX, chess960StartFen, randomChess960Index } from '../src/index';

const backRank = (index: number) => chess960StartFen(index).split(' ')[0]?.split('/')[7] ?? '';

describe('chess960StartFen', () => {
  it('maps index 518 to the standard starting position', () => {
    expect(CHESS960_STANDARD_INDEX).toBe(518);
    expect(chess960StartFen(518)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });

  it('follows Scharnagl numbering for known positions', () => {
    expect(backRank(0)).toBe('BBQNNRKR');
    expect(backRank(959)).toBe('RKRNNQBB');
  });

  it('produces 960 distinct, valid back ranks', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 960; i++) {
      const rank = backRank(i);
      seen.add(rank);
      expect([...rank].sort().join('')).toBe('BBKNNQRR');
      const bishops = [...rank].flatMap((p, f) => (p === 'B' ? [f] : []));
      expect(((bishops[0] ?? 0) + (bishops[1] ?? 0)) % 2).toBe(1); // opposite colors
      const king = rank.indexOf('K');
      expect(rank.indexOf('R')).toBeLessThan(king);
      expect(rank.lastIndexOf('R')).toBeGreaterThan(king);
    }
    expect(seen.size).toBe(960);
  });

  it("mirrors White's back rank for Black", () => {
    const [placement] = chess960StartFen(123).split(' ');
    const ranks = placement?.split('/') ?? [];
    expect(ranks[0]).toBe(ranks[7]?.toLowerCase());
  });

  it('uses X-FEN castling rights (outermost rooks)', () => {
    expect(chess960StartFen(0).split(' ')[2]).toBe('KQkq');
  });

  it('rejects indices outside 0..959', () => {
    expect(() => chess960StartFen(-1)).toThrow(RangeError);
    expect(() => chess960StartFen(960)).toThrow(RangeError);
    expect(() => chess960StartFen(1.5)).toThrow(RangeError);
  });
});

describe('randomChess960Index', () => {
  it('maps the random source onto 0..959', () => {
    expect(randomChess960Index(() => 0)).toBe(0);
    expect(randomChess960Index(() => 0.9999)).toBe(959);
    const i = randomChess960Index();
    expect(Number.isInteger(i) && i >= 0 && i < 960).toBe(true);
  });
});
