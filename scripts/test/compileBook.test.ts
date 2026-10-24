import { describe, expect, it } from 'vitest';
import { replayPgn } from '../src/eco/replayPgn';
import { compileBook } from '../src/eco/compileBook';
import type { RawOpening } from '../src/eco/parseTsv';

const rows: RawOpening[] = [
  { eco: 'B20', name: 'Sicilian Defense', pgn: '1. e4 c5' },
  { eco: 'B27', name: 'Sicilian Defense: Hyperaccelerated Dragon', pgn: '1. e4 c5 2. Nf3 g6' },
  { eco: 'C20', name: "King's Pawn Game", pgn: '1. e4' },
  { eco: 'B20', name: 'Sicilian Defense: Duplicate', pgn: '1.e4 c5' },
  { eco: 'A00', name: 'Broken Line', pgn: '1. e4 e4' },
];

const compile = () =>
  compileBook(rows, { source: 'lichess', generatedAt: '2026-10-23T00:00:00.000Z' });

describe('compileBook', () => {
  it('indexes each position by its normalized EPD', () => {
    const { book } = compile();
    const sicilianEpd = replayPgn('1. e4 c5').epd;
    expect(book.byEpd[sicilianEpd]).toEqual({
      eco: 'B20',
      name: 'Sicilian Defense',
      pgn: '1. e4 c5',
      uci: 'e2e4 c7c5',
    });
    expect(book.byEco['B20']).toEqual([sicilianEpd]);
  });

  it('keeps the first entry for a duplicate EPD and counts the duplicate', () => {
    const { book, duplicates } = compile();
    expect(duplicates).toBe(1);
    expect(book.byEpd[replayPgn('1. e4 c5').epd]?.name).toBe('Sicilian Defense');
  });

  it('skips rows with illegal PGN and keeps compiling the rest', () => {
    const { book, skipped } = compile();
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toContain('Broken Line');
    expect(book.count).toBe(3);
    expect(Object.keys(book.byEpd)).toHaveLength(3);
  });

  it('aggregates opening families with side, first move and ECO codes', () => {
    const { book } = compile();
    expect(book.families).toEqual([
      {
        name: "King's Pawn Game",
        side: 'white',
        firstMove: '1.e4',
        ecoCodes: ['C20'],
        count: 1,
        epds: [replayPgn('1. e4').epd],
      },
      {
        name: 'Sicilian Defense',
        side: 'black',
        firstMove: '1.e4',
        ecoCodes: ['B20', 'B27'],
        count: 2,
        epds: [replayPgn('1. e4 c5').epd, replayPgn('1. e4 c5 2. Nf3 g6').epd],
      },
    ]);
  });

  it('records unnamed positions along book lines as interior book positions', () => {
    const { book } = compileBook(
      [
        { eco: 'B20', name: 'Sicilian Defense', pgn: '1. e4 c5' },
        {
          eco: 'B27',
          name: 'Sicilian Defense: Hyperaccelerated Dragon',
          pgn: '1. e4 c5 2. Nf3 g6',
        },
        { eco: 'B27', name: 'Sicilian Defense: Other', pgn: '1. e4 c5 2. Nf3 a6' },
      ],
      { source: 'lichess', generatedAt: 'x' },
    );
    expect(book.interior).toEqual([replayPgn('1. e4').epd, replayPgn('1. e4 c5 2. Nf3').epd]);
  });

  const familyFirstMove = (family: RawOpening[]) =>
    compileBook(family, { source: 'lichess', generatedAt: 'x' }).book.families[0]?.firstMove;

  it("uses the family's most common first move, not a transposed shortest line", () => {
    expect(
      familyFirstMove([
        { eco: 'B06', name: 'Test Defense', pgn: '1. d4 g6' },
        { eco: 'B06', name: 'Test Defense: A', pgn: '1. e4 g6 2. Nf3' },
        { eco: 'B06', name: 'Test Defense: B', pgn: '1. e4 g6 2. d4' },
      ]),
    ).toBe('1.e4');
  });

  it('breaks a first-move tie with the shortest line', () => {
    expect(
      familyFirstMove([
        { eco: 'B06', name: 'Test Defense', pgn: '1. d4 g6' },
        { eco: 'B06', name: 'Test Defense: A', pgn: '1. e4 g6 2. Nf3' },
      ]),
    ).toBe('1.d4');
  });

  it('records metadata', () => {
    const { book } = compile();
    expect(book.version).toBe(1);
    expect(book.source).toBe('lichess');
    expect(book.generatedAt).toBe('2026-10-23T00:00:00.000Z');
  });
});
