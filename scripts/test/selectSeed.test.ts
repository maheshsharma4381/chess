import { describe, expect, it } from 'vitest';
import { selectSeed } from '../src/eco/selectSeed';
import type { RawOpening } from '../src/eco/parseTsv';

const rows: RawOpening[] = [
  { eco: 'B20', name: 'Sicilian Defense', pgn: '1. e4 c5' },
  { eco: 'C20', name: "King's Pawn Game", pgn: '1. e4' },
  {
    eco: 'B90',
    name: 'Sicilian Defense: Najdorf Variation',
    pgn: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6',
  },
  {
    eco: 'B90',
    name: 'Sicilian Defense: Najdorf Variation',
    pgn: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3',
  },
  { eco: 'A40', name: "Queen's Pawn Game", pgn: '1. d4' },
  { eco: 'A00', name: 'Broken Line', pgn: '1. e4 e4' },
];

describe('selectSeed', () => {
  it('puts curated openings first, using the shallowest row for a repeated name', () => {
    const { seed } = selectSeed(rows, ['Sicilian Defense: Najdorf Variation'], 2);
    expect(seed[0]?.pgn).toBe('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6');
    expect(seed).toHaveLength(2);
  });

  it('fills the remaining slots with the shallowest lines, without duplicates', () => {
    const { seed } = selectSeed(rows, ['Sicilian Defense'], 3);
    expect(seed.map((r) => r.name)).toEqual([
      'Sicilian Defense',
      "King's Pawn Game",
      "Queen's Pawn Game",
    ]);
  });

  it('reports curated names missing from the data and never includes illegal lines', () => {
    const { seed, missing } = selectSeed(rows, ['Nonexistent Gambit'], 10);
    expect(missing).toEqual(['Nonexistent Gambit']);
    expect(seed.map((r) => r.name)).not.toContain('Broken Line');
    expect(seed).toHaveLength(5);
  });
});
