import { Chess } from 'chess.js';
import type { EcoBook, OpeningEntry, OpeningFamily, WhiteFirstMove } from '@chess/types';

export const FIRST_MOVES: WhiteFirstMove[] = ['1.e4', '1.d4', '1.c4', '1.Nf3', 'Flank'];

/** Lowercase without accents or apostrophes, so "reti" finds "Réti" and "kings" finds "King's". */
const normalise = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/['’]/g, '').toLowerCase();

const plies = (o: OpeningEntry) => (o.uci ? o.uci.split(' ').length : 0);
const byLength = (a: OpeningEntry, b: OpeningEntry) =>
  plies(a) - plies(b) || a.name.localeCompare(b.name);

const ECO_QUERY = /^[a-e]\d{1,2}$/i;

/**
 * Named openings matching `query`: an ECO code or prefix ("B20", "C6"), otherwise every
 * word must appear in the name. Shortest lines first, so the parent opening leads.
 */
export function searchOpenings(book: EcoBook, query: string, limit = 50): OpeningEntry[] {
  const q = query.trim();
  if (!q) return [];
  const entries = Object.values(book.byEpd);
  let matches: OpeningEntry[];
  if (ECO_QUERY.test(q)) {
    const prefix = q.toUpperCase();
    matches = entries.filter((o) => o.eco.startsWith(prefix));
  } else {
    const words = normalise(q).split(/\s+/);
    matches = entries.filter((o) => {
      const name = normalise(o.name);
      return words.every((w) => name.includes(w));
    });
  }
  return matches.sort(byLength).slice(0, limit);
}

/** Families per White first move, the most-played (most named lines) first. */
export function familiesByFirstMove(book: EcoBook): Record<WhiteFirstMove, OpeningFamily[]> {
  const groups = Object.fromEntries(FIRST_MOVES.map((m) => [m, [] as OpeningFamily[]])) as Record<
    WhiteFirstMove,
    OpeningFamily[]
  >;
  for (const family of book.families) groups[family.firstMove].push(family);
  for (const list of Object.values(groups)) {
    list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  return groups;
}

/** A family's named lines, shortest first. */
export function familyLines(book: EcoBook, family: OpeningFamily): OpeningEntry[] {
  return family.epds
    .map((epd) => book.byEpd[epd])
    .filter((o): o is OpeningEntry => o !== undefined)
    .sort(byLength);
}

/** Opens the line's final position on the analysis board with the explorer showing. */
export function practiceHref(entry: OpeningEntry): string {
  const chess = new Chess();
  for (const uci of entry.uci.split(' ').filter(Boolean)) {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  }
  return `/analysis?fen=${encodeURIComponent(chess.fen())}&explorer=1`;
}
