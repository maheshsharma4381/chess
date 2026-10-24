import { describe, expect, it } from 'vitest';
import type { Motif, MotifType } from '@chess/types';
import { detectMotifs, type MotifInput } from '../src/index';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const input = (overrides: Partial<MotifInput>): MotifInput => ({
  fenBefore: START,
  uci: 'e2e4',
  ply: 30,
  bestLine: [],
  replyLine: [],
  scoreAfter: { cp: 0 },
  isBook: false,
  bookOpening: null,
  deviation: null,
  sacrifice: false,
  ...overrides,
});

const find = (motifs: Motif[], type: MotifType) => motifs.find((m) => m.type === type);
const types = (motifs: Motif[]) => motifs.map((m) => m.type);

describe('hanging pieces', () => {
  it('flags a piece moved to a square where it can be won', () => {
    const motifs = detectMotifs(
      input({ fenBefore: '4k3/8/8/3p4/8/8/1N6/4K3 w - - 0 1', uci: 'b2c4' }),
    );
    expect(find(motifs, 'hanging-piece')).toMatchObject({
      squares: ['c4'],
      detail: { piece: 'knight', source: 'played' },
    });
  });

  it('flags a defended piece attacked by a lower-value piece', () => {
    const motifs = detectMotifs(
      input({ fenBefore: '4k3/8/8/3p4/8/3P1B2/8/4K3 w - - 0 1', uci: 'f3e4' }),
    );
    expect(find(motifs, 'hanging-piece')).toMatchObject({
      squares: ['e4'],
      detail: { piece: 'bishop' },
    });
  });
});

describe('forks', () => {
  it('detects the played move forking king and rook', () => {
    const motifs = detectMotifs(
      input({ fenBefore: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', uci: 'b5c7' }),
    );
    const fork = find(motifs, 'fork');
    expect(fork?.squares[0]).toBe('c7');
    expect([...(fork?.squares.slice(1) ?? [])].sort()).toEqual(['a8', 'e8']);
    expect(fork?.detail).toMatchObject({ piece: 'knight', source: 'played' });
    expect(['king and rook', 'rook and king']).toContain(fork?.detail['targets']);
  });

  it('detects a fork the best line had and the played move missed', () => {
    const motifs = detectMotifs(
      input({ fenBefore: 'r3k3/8/8/1N6/8/8/7P/4K3 w - - 0 1', uci: 'h2h3', bestLine: ['b5c7'] }),
    );
    expect(find(motifs, 'fork')?.detail).toMatchObject({ source: 'best' });
  });
});

describe('pins and skewers', () => {
  it('detects a bishop pinning a knight to the king', () => {
    const motifs = detectMotifs(
      input({ fenBefore: '4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1', uci: 'f1b5' }),
    );
    expect(find(motifs, 'pin')).toMatchObject({
      squares: ['b5', 'c6', 'e8'],
      detail: { piece: 'knight' },
    });
  });

  it('detects a rook skewering a queen in front of a rook', () => {
    const motifs = detectMotifs(
      input({ fenBefore: '3rk3/8/8/3q4/8/8/8/R3K3 w - - 0 1', uci: 'a1d1' }),
    );
    expect(find(motifs, 'skewer')).toMatchObject({ squares: ['d1', 'd5', 'd8'] });
  });
});

describe('discovered attacks', () => {
  it('detects a discovered check', () => {
    const motifs = detectMotifs(
      input({ fenBefore: '7k/8/8/8/3N4/8/1B6/4K3 w - - 0 1', uci: 'd4f5' }),
    );
    expect(find(motifs, 'discovered-check')).toMatchObject({ squares: ['b2', 'h8'] });
  });

  it('detects a discovered attack on the queen', () => {
    const motifs = detectMotifs(
      input({ fenBefore: 'k6q/8/8/8/3N4/8/1B6/4K3 w - - 0 1', uci: 'd4b5' }),
    );
    expect(find(motifs, 'discovered-attack')).toMatchObject({
      squares: ['b2', 'h8'],
      detail: { piece: 'queen' },
    });
  });
});

describe('mating patterns', () => {
  it('detects a back-rank mate the best line had', () => {
    const motifs = detectMotifs(
      input({
        fenBefore: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
        uci: 'h2h3',
        bestLine: ['d1d8'],
      }),
    );
    expect(find(motifs, 'back-rank')).toMatchObject({
      squares: ['d8', 'g8'],
      detail: { source: 'best' },
    });
  });

  it('detects a back-rank mate the played move allowed', () => {
    const motifs = detectMotifs(
      input({
        fenBefore: '3r2k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1',
        uci: 'g1h1',
        replyLine: ['d8d1'],
        scoreAfter: { mate: -1 },
      }),
    );
    expect(find(motifs, 'back-rank')?.detail).toMatchObject({ source: 'reply' });
    expect(find(motifs, 'mate-threat')).toBeUndefined();
  });

  it('reports a generic mate threat when the mate is not on the back rank', () => {
    const motifs = detectMotifs(input({ scoreAfter: { mate: -2 } }));
    expect(find(motifs, 'mate-threat')?.detail).toMatchObject({ source: 'reply', mateIn: 2 });
  });
});

describe('sacrifice and book', () => {
  it('passes the sacrifice flag through', () => {
    expect(types(detectMotifs(input({ sacrifice: true })))).toContain('sacrifice');
  });

  it('names the opening for book moves and the theory move on a deviation', () => {
    const opening = {
      eco: 'B90',
      name: 'Sicilian Defense: Najdorf Variation',
      pgn: '1. e4 c5',
      lastBookPly: 10,
    };
    expect(
      find(detectMotifs(input({ isBook: true, bookOpening: opening })), 'book')?.detail,
    ).toEqual({
      eco: 'B90',
      name: 'Sicilian Defense: Najdorf Variation',
    });
    expect(
      find(
        detectMotifs(input({ bookOpening: opening, deviation: { bestBookSan: 'Be3' } })),
        'book-deviation',
      )?.detail,
    ).toEqual({ eco: 'B90', name: 'Sicilian Defense: Najdorf Variation', bestBookSan: 'Be3' });
  });
});

describe('positional factors', () => {
  it('notes king safety when castling', () => {
    const motifs = detectMotifs(
      input({ fenBefore: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', uci: 'e1g1' }),
    );
    expect(find(motifs, 'king-safety')?.detail).toMatchObject({ castled: 'kingside' });
  });

  it('notes doubled pawns created by a capture', () => {
    const motifs = detectMotifs(
      input({ fenBefore: '4k3/8/8/3n4/4P3/8/3P4/4K3 w - - 0 1', uci: 'e4d5' }),
    );
    expect(find(motifs, 'pawn-structure')?.detail).toMatchObject({ issue: 'doubled' });
  });

  it('notes development and center control early in the game', () => {
    expect(types(detectMotifs(input({ uci: 'g1f3', ply: 1 })))).toContain('development');
    expect(types(detectMotifs(input({ uci: 'e2e4', ply: 1 })))).toContain('center-control');
    expect(types(detectMotifs(input({ uci: 'g1f3', ply: 30 })))).not.toContain('development');
  });

  it('finds nothing in a quiet move', () => {
    expect(
      detectMotifs(input({ fenBefore: '4k3/8/8/8/8/8/P7/4K3 w - - 0 1', uci: 'a2a3', ply: 60 })),
    ).toEqual([]);
  });
});
