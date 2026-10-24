import type { EcoBook, OpeningFamily, WhiteFirstMove } from '@chess/types';
import { classifyFamily, familyOf, toWhiteFirstMove } from './classifyFamily';
import type { RawOpening } from './parseTsv';
import { replayPgn } from './replayPgn';

export interface CompileOptions {
  source: EcoBook['source'];
  generatedAt: string;
}

export interface CompileResult {
  book: EcoBook;
  /** One human-readable line per row that could not be replayed. */
  skipped: string[];
  /** Rows whose position was already in the book (transpositions); first entry wins. */
  duplicates: number;
}

interface FamilyAccumulator {
  ecoCodes: Set<string>;
  epds: string[];
  firstMoves: Map<WhiteFirstMove, number>;
  shortestLine: string[];
}

/**
 * The family's usual first move. The shortest line can be a transposition
 * (Pterodactyl Defense's shortest line starts 1.d4 though most lines start 1.e4).
 */
function majorityFirstMove(acc: FamilyAccumulator): WhiteFirstMove {
  const tieBreak = toWhiteFirstMove(acc.shortestLine[0]);
  let best = tieBreak;
  let bestCount = acc.firstMoves.get(tieBreak) ?? 0;
  for (const [move, n] of acc.firstMoves) {
    if (n > bestCount) {
      best = move;
      bestCount = n;
    }
  }
  return best;
}

export function compileBook(rows: RawOpening[], options: CompileOptions): CompileResult {
  const byEpd: EcoBook['byEpd'] = {};
  const byEco: EcoBook['byEco'] = {};
  const families = new Map<string, FamilyAccumulator>();
  const skipped: string[] = [];
  const prefixCandidates = new Set<string>();
  let duplicates = 0;

  for (const row of rows) {
    let line;
    try {
      line = replayPgn(row.pgn);
    } catch (err) {
      skipped.push(`${row.eco} ${row.name}: ${(err as Error).message}`);
      continue;
    }

    for (const epd of line.prefixEpds.slice(0, -1)) prefixCandidates.add(epd);

    if (byEpd[line.epd]) {
      duplicates++;
      continue;
    }
    byEpd[line.epd] = { eco: row.eco, name: row.name, pgn: row.pgn, uci: line.uci };
    (byEco[row.eco] ??= []).push(line.epd);

    const familyName = familyOf(row.name);
    let family = families.get(familyName);
    if (!family) {
      family = { ecoCodes: new Set(), epds: [], firstMoves: new Map(), shortestLine: line.sans };
      families.set(familyName, family);
    }
    family.ecoCodes.add(row.eco);
    family.epds.push(line.epd);
    const first = toWhiteFirstMove(line.sans[0]);
    family.firstMoves.set(first, (family.firstMoves.get(first) ?? 0) + 1);
    if (line.sans.length < family.shortestLine.length) family.shortestLine = line.sans;
  }

  const familyList: OpeningFamily[] = [...families]
    .map(([name, acc]) => ({
      name,
      side: classifyFamily(name, acc.shortestLine).side,
      firstMove: majorityFirstMove(acc),
      ecoCodes: [...acc.ecoCodes].sort(),
      count: acc.epds.length,
      epds: acc.epds,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const count = Object.keys(byEpd).length;
  return {
    book: {
      version: 1,
      source: options.source,
      generatedAt: options.generatedAt,
      count,
      byEpd,
      byEco,
      // Filtered after all rows: a prefix may be named by a later row.
      interior: [...prefixCandidates].filter((epd) => !byEpd[epd]),
      families: familyList,
    },
    skipped,
    duplicates,
  };
}
