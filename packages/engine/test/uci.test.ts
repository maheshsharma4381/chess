import { describe, expect, it } from 'vitest';
import { parseBestMove, parseInfoLine } from '../src/index';

describe('parseInfoLine', () => {
  it('parses a MultiPV centipawn line', () => {
    expect(
      parseInfoLine(
        'info depth 18 seldepth 24 multipv 2 score cp -35 nodes 123456 nps 900000 tbhits 0 time 140 pv e7e5 g1f3 b8c6',
      ),
    ).toEqual({ multipv: 2, depth: 18, score: { cp: -35 }, pv: ['e7e5', 'g1f3', 'b8c6'] });
  });

  it('parses a mate score and defaults multipv to 1', () => {
    expect(parseInfoLine('info depth 5 score mate -3 pv h7h6 d1h5')).toEqual({
      multipv: 1,
      depth: 5,
      score: { mate: -3 },
      pv: ['h7h6', 'd1h5'],
    });
  });

  it('ignores bound scores, lines without a pv, and other info', () => {
    expect(parseInfoLine('info depth 12 multipv 1 score cp 40 lowerbound pv e2e4')).toBeNull();
    expect(parseInfoLine('info depth 12 currmove e2e4 currmovenumber 1')).toBeNull();
    expect(parseInfoLine('info string NNUE evaluation using nn.nnue')).toBeNull();
    expect(parseInfoLine('readyok')).toBeNull();
  });
});

describe('parseBestMove', () => {
  it('parses bestmove with and without ponder', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toEqual({
      bestmove: 'e2e4',
      ponder: 'e7e5',
    });
    expect(parseBestMove('bestmove a7a8q')).toEqual({ bestmove: 'a7a8q' });
    expect(parseBestMove('info depth 1')).toBeNull();
  });
});
