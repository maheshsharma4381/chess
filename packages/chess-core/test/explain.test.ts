import { describe, expect, it } from 'vitest';
import { MOVE_CLASSIFICATIONS, type Motif, type MoveReview } from '@chess/types';
import { explainMove, formatScore } from '../src/index';

const review = (overrides: Partial<MoveReview>): MoveReview => ({
  ply: 15,
  color: 'white',
  san: 'Nxf7',
  uci: 'g5f7',
  fenBefore: '',
  fenAfter: '',
  classification: 'good',
  accuracy: 90,
  winBefore: 52,
  winAfter: 50,
  scoreBefore: { cp: 30 },
  scoreAfter: { cp: 240 },
  bestMove: { uci: 'g5f7', san: 'Nxf7' },
  secondBestMove: null,
  pv: [],
  isBook: false,
  phase: 'middlegame',
  motifs: [],
  ...overrides,
});

const sacrifice: Motif = { type: 'sacrifice', squares: ['f7'], detail: {} };
const fork: Motif = {
  type: 'fork',
  squares: ['e6', 'e8', 'c4'],
  detail: { piece: 'queen', targets: 'king and bishop', source: 'played' },
};
const hanging: Motif = {
  type: 'hanging-piece',
  squares: ['c4'],
  detail: { piece: 'knight', source: 'played' },
};
const najdorf = { eco: 'B90', name: 'Sicilian Defense: Najdorf Variation' };

describe('explainMove (English)', () => {
  it('celebrates a brilliant sacrifice and names the tactic', () => {
    const out = explainMove(
      review({ classification: 'brilliant', motifs: [sacrifice, fork] }),
      'en',
    );
    expect(out.headline).toBe('Nxf7!! is a Brilliant move');
    expect(out.evalChange).toBe('+0.3 → +2.4');
    expect(out.text).toMatch(/sacrific/i);
    expect(out.text).toMatch(/fork/i);
    expect(out.motifs).toEqual(['sacrifice', 'fork']);
  });

  it('points at the hanging piece and the better move after a blunder', () => {
    const out = explainMove(
      review({
        san: 'Nc4',
        classification: 'blunder',
        motifs: [hanging],
        bestMove: { uci: 'b1d2', san: 'Nd2' },
      }),
      'en',
    );
    expect(out.headline).toBe('Nc4?? is a Blunder');
    expect(out.text).toContain('knight');
    expect(out.text).toContain('c4');
    expect(out.text).toContain('Nd2');
  });

  it('names the opening for a book move', () => {
    const out = explainMove(
      review({
        san: 'a6',
        classification: 'book',
        isBook: true,
        motifs: [{ type: 'book', squares: [], detail: najdorf }],
      }),
      'en',
    );
    expect(out.text).toContain('B90 Sicilian Defense: Najdorf Variation');
  });

  it('explains leaving theory with the main-line move', () => {
    const out = explainMove(
      review({
        san: 'h3',
        classification: 'inaccuracy',
        motifs: [
          { type: 'book-deviation', squares: [], detail: { ...najdorf, bestBookSan: 'Be3' } },
        ],
        bestMove: { uci: 'c1e3', san: 'Be3' },
      }),
      'en',
    );
    expect(out.text).toMatch(/theory/i);
    expect(out.text).toContain('Be3');
  });

  it('does not suggest a better move when the played move was the best', () => {
    const out = explainMove(review({ classification: 'best' }), 'en');
    expect(out.text).not.toMatch(/Best was/);
  });
});

describe('checkmating moves', () => {
  const mate = review({
    san: 'Qxf7#',
    classification: 'best',
    scoreBefore: { mate: 1 },
    scoreAfter: { mate: 1 },
    motifs: [{ type: 'mate-threat', squares: [], detail: { source: 'played', mateIn: 1 } }],
  });

  it('says checkmate instead of "forced mate in 1"', () => {
    const out = explainMove(mate, 'en');
    expect(out.text.startsWith('Checkmate!')).toBe(true);
    expect(out.text).not.toMatch(/forced mate/i);
    expect(out.evalChange).toBe('M1 → #');
  });

  it('says checkmate in Hinglish', () => {
    expect(explainMove(mate, 'hinglish').text).toMatch(/^Checkmate kar diya!/);
  });
});

describe('explainMove (Hinglish)', () => {
  it('explains the brilliant sacrifice in Hinglish', () => {
    const out = explainMove(
      review({ classification: 'brilliant', motifs: [sacrifice, fork] }),
      'hinglish',
    );
    expect(out.headline).toBe('Nxf7!! ek Brilliant move hai');
    expect(out.text).toMatch(/aapne/i);
    expect(out.text).toMatch(/sacrifice/i);
    expect(out.text).toMatch(/fork/i);
  });

  it('suggests the better move in Hinglish', () => {
    const out = explainMove(
      review({
        classification: 'mistake',
        motifs: [hanging],
        bestMove: { uci: 'b1d2', san: 'Nd2' },
      }),
      'hinglish',
    );
    expect(out.text).toContain('Nd2');
    expect(out.text).toMatch(/knight/);
  });
});

describe('formatScore', () => {
  it('renders centipawns as signed pawns and mates as M<n>', () => {
    expect(formatScore({ cp: 30 })).toBe('+0.3');
    expect(formatScore({ cp: -180 })).toBe('-1.8');
    expect(formatScore({ cp: 0 })).toBe('0.0');
    expect(formatScore({ mate: 3 })).toBe('M3');
    expect(formatScore({ mate: -2 })).toBe('-M2');
  });
});

describe('every classification', () => {
  it.each(MOVE_CLASSIFICATIONS)('%s has English and Hinglish text', (classification) => {
    const r = review({ classification, bestMove: { uci: 'a2a3', san: 'a3' } });
    for (const lang of ['en', 'hinglish'] as const) {
      const out = explainMove(r, lang);
      expect(out.headline.length).toBeGreaterThan(0);
      expect(out.text.trim().length).toBeGreaterThan(0);
    }
  });
});
