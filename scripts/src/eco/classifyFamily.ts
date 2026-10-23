import type { OpeningFamily, WhiteFirstMove } from '@chess/types';

const BLACK_NAME = /Defen[cs]e|Declined|Accepted|Counter-?gambit/i;
const WHITE_NAME = /Opening|Attack|System|Game/i;

const FIRST_MOVES: Record<string, WhiteFirstMove> = {
  e4: '1.e4',
  d4: '1.d4',
  c4: '1.c4',
  Nf3: '1.Nf3',
};

/**
 * "Sicilian Defense: Najdorf Variation" -> "Sicilian Defense".
 * Some Lichess sub-lines use a comma instead ("London System, with Bd3").
 */
export function familyOf(name: string): string {
  return (name.split(/[:,]/)[0] ?? name).trim();
}

/**
 * Decides whether a family is a White system or a Black counter-defense.
 * The name decides when it is explicit ("Defense", "Opening"...). Otherwise the side
 * that played the last move of the family's shortest line is the one that chose it
 * (e.g. Benko Gambit ends with ...b5, Ruy Lopez ends with Bb5).
 */
export function classifyFamily(
  family: string,
  shortestLine: string[],
): Pick<OpeningFamily, 'side' | 'firstMove'> {
  let side: OpeningFamily['side'];
  if (BLACK_NAME.test(family)) side = 'black';
  else if (WHITE_NAME.test(family)) side = 'white';
  else side = shortestLine.length % 2 === 1 ? 'white' : 'black';

  const firstMove = FIRST_MOVES[shortestLine[0] ?? ''] ?? 'Flank';
  return { side, firstMove };
}
