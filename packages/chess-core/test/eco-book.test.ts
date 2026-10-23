import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { EcoBook } from '@chess/types';
import { normalizeEpd } from '../src/index';

const book = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../src/data/eco-book.json'), 'utf8'),
) as EcoBook;

const epdAfter = (sans: string[]) => {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return normalizeEpd(chess.fen());
};

describe('generated eco-book.json', () => {
  it('is a full Lichess build', () => {
    expect(book.source).toBe('lichess');
    expect(book.count).toBeGreaterThanOrEqual(3400);
    expect(Object.keys(book.byEpd)).toHaveLength(book.count);
  });

  it('does not treat the starting position as an opening', () => {
    expect(book.byEpd[normalizeEpd(new Chess().fen())]).toBeUndefined();
  });

  it('finds the Sicilian Defense after 1.e4 c5', () => {
    expect(book.byEpd[epdAfter(['e4', 'c5'])]).toMatchObject({
      eco: 'B20',
      name: 'Sicilian Defense',
      uci: 'e2e4 c7c5',
    });
  });

  it('finds the Najdorf by position', () => {
    const najdorf = epdAfter(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']);
    expect(book.byEpd[najdorf]).toMatchObject({
      eco: 'B90',
      name: 'Sicilian Defense: Najdorf Variation',
    });
  });

  it('indexes byEco with valid codes pointing at existing positions', () => {
    for (const [eco, epds] of Object.entries(book.byEco)) {
      expect(eco).toMatch(/^[A-E]\d{2}$/);
      for (const epd of epds) expect(book.byEpd[epd]?.eco).toBe(eco);
    }
  });

  it('groups families by White first move and side', () => {
    const family = (name: string) => book.families.find((f) => f.name === name);
    expect(family('Sicilian Defense')).toMatchObject({ side: 'black', firstMove: '1.e4' });
    expect(family("Queen's Gambit Declined")).toMatchObject({ side: 'black', firstMove: '1.d4' });
    expect(family('English Opening')).toMatchObject({ side: 'white', firstMove: '1.c4' });
    expect(family('Ruy Lopez')).toMatchObject({ side: 'white', firstMove: '1.e4' });
  });
});
