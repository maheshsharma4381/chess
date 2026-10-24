import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { parsePgn } from '../src/index';

describe('parsePgn with Black to move first', () => {
  it('reads the "1. ... e5" movetext chess.js writes for a Black-to-move start', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const c = new Chess(fen);
    c.move('e5');
    c.move('Nf3');
    const pgn = c.pgn();
    expect(pgn).toContain('1. ... e5');
    expect(parsePgn(pgn)).toEqual({ startFen: fen, sans: ['e5', 'Nf3'] });
  });

  it('reads "1... e5" and "12...Nf6" forms', () => {
    expect(parsePgn('1... e5 2. Nf3').sans).toEqual(['e5', 'Nf3']);
    expect(parsePgn('12...Nf6 13. Bg5').sans).toEqual(['Nf6', 'Bg5']);
  });
});
