import { describe, expect, it } from 'vitest';
import { normalizeEpd } from '../src/index';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('normalizeEpd', () => {
  it('strips halfmove and fullmove counters', () => {
    expect(normalizeEpd(START)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  });

  it('accepts a 4-field EPD as input', () => {
    expect(normalizeEpd('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -')).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
    );
  });

  it('drops an en passant square when no pawn can capture', () => {
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    expect(normalizeEpd(afterE4)).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -');
  });

  it('keeps an en passant square when a legal capture exists', () => {
    const fen = 'rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
    expect(normalizeEpd(fen)).toBe('rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6');
  });

  it('does not invent an en passant square the FEN lacks', () => {
    const fen = 'rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3';
    expect(normalizeEpd(fen)).toBe('rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq -');
  });

  it('drops an en passant square when the capture would expose the king', () => {
    const pinned = '8/8/8/K2pP2r/8/8/8/7k w - d6 0 1';
    expect(normalizeEpd(pinned)).toBe('8/8/8/K2pP2r/8/8/8/7k w - -');
  });

  it('throws on an invalid FEN', () => {
    expect(() => normalizeEpd('not a fen')).toThrow(/Invalid FEN/);
  });
});
