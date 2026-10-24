import { describe, expect, it } from 'vitest';
import { normalizeEpd } from '@chess/chess-core';
import { replayPgn } from '../src/eco/replayPgn';

describe('replayPgn', () => {
  it('derives UCI, SAN list, ply count and EPD', () => {
    const result = replayPgn('1. e4 c5');
    expect(result.uci).toBe('e2e4 c7c5');
    expect(result.sans).toEqual(['e4', 'c5']);
    expect(result.plies).toBe(2);
    expect(result.epd).toBe(
      normalizeEpd('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2'),
    );
  });

  it('lists the EPD after every ply, ending with the final position', () => {
    const result = replayPgn('1. e4 c5 2. Nf3');
    expect(result.prefixEpds).toHaveLength(3);
    expect(result.prefixEpds[0]).toBe(replayPgn('1. e4').epd);
    expect(result.prefixEpds.at(-1)).toBe(result.epd);
  });

  it('accepts compact move numbers like "1.e4"', () => {
    expect(replayPgn('1.e4 e5 2.Nf3').uci).toBe('e2e4 e7e5 g1f3');
  });

  it('encodes castling as king movement', () => {
    const result = replayPgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O');
    expect(result.uci.split(' ').at(-1)).toBe('e1g1');
  });

  it('appends the promotion piece to UCI', () => {
    const result = replayPgn('1. e4 d5 2. exd5 c6 3. dxc6 Nf6 4. cxb7 Nbd7 5. bxa8=Q');
    expect(result.uci.split(' ').at(-1)).toBe('b7a8q');
  });

  it('throws on an illegal move', () => {
    expect(() => replayPgn('1. e4 e4')).toThrow(/Illegal move "e4" at ply 2/);
  });
});
