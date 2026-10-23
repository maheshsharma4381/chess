import { describe, expect, it } from 'vitest';
import { parseTsv } from '../src/eco/parseTsv';

describe('parseTsv', () => {
  it('parses rows and skips the header', () => {
    const text = 'eco\tname\tpgn\nA00\tAmar Opening\t1. Nh3\nB20\tSicilian Defense\t1. e4 c5\n';
    expect(parseTsv(text)).toEqual([
      { eco: 'A00', name: 'Amar Opening', pgn: '1. Nh3' },
      { eco: 'B20', name: 'Sicilian Defense', pgn: '1. e4 c5' },
    ]);
  });

  it('handles CRLF line endings and blank lines', () => {
    const text = 'eco\tname\tpgn\r\n\r\nB20\tSicilian Defense\t1. e4 c5\r\n\r\n';
    expect(parseTsv(text)).toEqual([{ eco: 'B20', name: 'Sicilian Defense', pgn: '1. e4 c5' }]);
  });

  it('skips rows with missing columns, invalid ECO codes, or a repeated header', () => {
    const text = [
      'eco\tname\tpgn',
      'B20\tSicilian Defense',
      'Z99\tNonsense\t1. e4',
      'eco\tname\tpgn',
      'C00\tFrench Defense\t1. e4 e6',
    ].join('\n');
    expect(parseTsv(text)).toEqual([{ eco: 'C00', name: 'French Defense', pgn: '1. e4 e6' }]);
  });
});
