import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { EcoBook } from '@chess/types';
import { OpeningLookupService, loadEcoBook, normalizeEpd } from '../src/index';

const service = new OpeningLookupService(loadEcoBook());
const START = new Chess().fen();

/** FEN after each ply, starting with the initial position. */
const history = (sans: string): string[] => {
  const chess = new Chess();
  return [chess.fen(), ...sans.split(' ').map((san) => (chess.move(san), chess.fen()))];
};

describe('OpeningLookupService.getOpeningByFen', () => {
  it('finds a named opening from a full FEN with counters and an en passant square', () => {
    const fen = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2';
    expect(service.getOpeningByFen(fen)).toMatchObject({ eco: 'B20', name: 'Sicilian Defense' });
  });

  it('returns null for the starting position', () => {
    expect(service.getOpeningByFen(START)).toBeNull();
  });

  it('throws on an invalid FEN', () => {
    expect(() => service.getOpeningByFen('garbage')).toThrow(/Invalid FEN/);
  });
});

describe('OpeningLookupService.bookMovesFrom', () => {
  it('lists the book continuations from a position, sorted by SAN', () => {
    const moves = service.bookMovesFrom(START);
    const sans = moves.map((m) => m.san);
    expect(sans).toContain('e4');
    expect(sans).toContain('d4');
    expect(sans).toEqual([...sans].sort());
    expect(moves.find((m) => m.san === 'e4')?.opening?.name).toBe("King's Pawn Game");
  });

  it('includes interior continuations that have no name of their own', () => {
    const fen = history('e4 c5 Nf3 d6 d4 cxd4').at(-1) as string;
    expect(service.bookMovesFrom(fen)).toContainEqual({ uci: 'f3d4', san: 'Nxd4', opening: null });
  });
});

describe('OpeningLookupService.trackGameOpening', () => {
  it('treats unnamed theory moves inside a line as book (Najdorf via 4.Nxd4 and 5.Nc3)', () => {
    const track = service.trackGameOpening(history('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'));
    expect(track.bookPlies).toEqual(Array(10).fill(true));
    expect(track.opening).toMatchObject({
      eco: 'B90',
      name: 'Sicilian Defense: Najdorf Variation',
      lastBookPly: 10,
    });
    expect(track.isBookMove).toBe(true);
    expect(track.deviationPly).toBeNull();
  });

  it('reports the first ply that leaves book and keeps it after a transposition back', () => {
    const track = service.trackGameOpening(history('e4 e5 Nf3 Nc6 Bc4 h6 d3 Nf6'));
    expect(track.deviationPly).toBe(7);
    expect(track.bookPlies).toEqual([true, true, true, true, true, true, false, true]);
    expect(track.isBookMove).toBe(true);
    expect(track.opening).toMatchObject({
      eco: 'C50',
      name: 'Italian Game: Anti-Fried Liver Defense',
      lastBookPly: 8,
    });
  });

  it('never counts a position after move 20 (ply 40) as book', () => {
    const afterNf3 = history('Nf3').at(-1) as string;
    const tinyBook: EcoBook = {
      version: 1,
      source: 'seed',
      generatedAt: 'x',
      count: 1,
      byEpd: {
        [normalizeEpd(afterNf3)]: {
          eco: 'A04',
          name: 'Zukertort Opening',
          pgn: '1. Nf3',
          uci: 'g1f3',
        },
      },
      byEco: {},
      interior: [],
      families: [],
    };
    // Knights shuffle, so plies 1, 5, 9, ..., 41 all reach the position after 1.Nf3.
    const shuffle = Array.from({ length: 10 }, () => 'Nf3 Nf6 Ng1 Ng8').join(' ') + ' Nf3';
    const track = new OpeningLookupService(tinyBook).trackGameOpening(history(shuffle));
    expect(track.bookPlies[0]).toBe(true);
    expect(track.bookPlies[36]).toBe(true);
    expect(track.bookPlies[40]).toBe(false);
    expect(track.isBookMove).toBe(false);
  });

  it('handles a game with no moves', () => {
    expect(service.trackGameOpening([START])).toEqual({
      opening: null,
      isBookMove: false,
      deviationPly: null,
      bookPlies: [],
    });
    expect(service.trackGameOpening([])).toEqual({
      opening: null,
      isBookMove: false,
      deviationPly: null,
      bookPlies: [],
    });
  });
});
