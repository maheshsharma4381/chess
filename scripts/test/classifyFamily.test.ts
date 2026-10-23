import { describe, expect, it } from 'vitest';
import { classifyFamily, familyOf } from '../src/eco/classifyFamily';

describe('familyOf', () => {
  it('takes the part of the name before the colon', () => {
    expect(familyOf('Sicilian Defense: Najdorf Variation')).toBe('Sicilian Defense');
    expect(familyOf('Ruy Lopez')).toBe('Ruy Lopez');
  });

  it('also stops at a comma, which Lichess uses for sub-lines without a colon', () => {
    expect(familyOf('Vienna Gambit, with Max Lange Defense')).toBe('Vienna Gambit');
    expect(familyOf('London System, with Bd3')).toBe('London System');
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

  it('treats named "Game" openings as White systems unless the name says Black chose it', () => {
    expect(classifyFamily('Four Knights Game', ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'])).toEqual({
      side: 'white',
      firstMove: '1.e4',
    });
    expect(classifyFamily('Center Game Accepted', ['e4', 'e5', 'd4', 'exd4'])).toEqual({
      side: 'black',
      firstMove: '1.e4',
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
