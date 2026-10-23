import { describe, expect, it } from 'vitest';
import { classifyFamily, familyOf } from '../src/eco/classifyFamily';

describe('familyOf', () => {
  it('takes the part of the name before the colon', () => {
    expect(familyOf('Sicilian Defense: Najdorf Variation')).toBe('Sicilian Defense');
    expect(familyOf('Ruy Lopez')).toBe('Ruy Lopez');
  });
});

describe('classifyFamily', () => {
  it('treats named defenses as Black counter-defenses', () => {
    expect(classifyFamily('Sicilian Defense', ['e4', 'c5'])).toEqual({
      side: 'black',
      firstMove: '1.e4',
    });
    expect(classifyFamily("Queen's Gambit Declined", ['d4', 'd5', 'c4', 'e6'])).toEqual({
      side: 'black',
      firstMove: '1.d4',
    });
  });

  it('treats named openings, attacks and systems as White systems', () => {
    expect(classifyFamily('English Opening', ['c4'])).toEqual({ side: 'white', firstMove: '1.c4' });
    expect(classifyFamily('Zukertort Opening', ['Nf3'])).toEqual({
      side: 'white',
      firstMove: '1.Nf3',
    });
  });

  it('groups non-central first moves as Flank', () => {
    expect(classifyFamily('Bird Opening', ['f4'])).toEqual({ side: 'white', firstMove: 'Flank' });
  });

  it('falls back to who played the last move of the shortest line', () => {
    expect(classifyFamily('Ruy Lopez', ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'])).toEqual({
      side: 'white',
      firstMove: '1.e4',
    });
    expect(classifyFamily('Benko Gambit', ['d4', 'Nf6', 'c4', 'c5', 'd5', 'b5'])).toEqual({
      side: 'black',
      firstMove: '1.d4',
    });
  });
});
