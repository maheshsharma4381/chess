import type { EcoBook, OpeningFamily } from '@chess/types';
import { classifyFamily, familyOf } from './classifyFamily';
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
  count: number;
  shortestLine: string[];
}

export function compileBook(rows: RawOpening[], options: CompileOptions): CompileResult {
  const byEpd: EcoBook['byEpd'] = {};
  const byEco: EcoBook['byEco'] = {};
  const families = new Map<string, FamilyAccumulator>();
  const skipped: string[] = [];
  let duplicates = 0;

  for (const row of rows) {
    let line;
    try {
      line = replayPgn(row.pgn);
    } catch (err) {
      skipped.push(`${row.eco} ${row.name}: ${(err as Error).message}`);
      continue;
    }

    if (byEpd[line.epd]) {
      duplicates++;
      continue;
    }
    byEpd[line.epd] = { eco: row.eco, name: row.name, pgn: row.pgn, uci: line.uci };
    (byEco[row.eco] ??= []).push(line.epd);

    const familyName = familyOf(row.name);
    const family = families.get(familyName);
    if (!family) {
      families.set(familyName, {
        ecoCodes: new Set([row.eco]),
        count: 1,
        shortestLine: line.sans,
      });
    } else {
      family.ecoCodes.add(row.eco);
      family.count++;
      if (line.sans.length < family.shortestLine.length) family.shortestLine = line.sans;
    }
  }

  const familyList: OpeningFamily[] = [...families]
    .map(([name, acc]) => ({
      name,
      ...classifyFamily(name, acc.shortestLine),
      ecoCodes: [...acc.ecoCodes].sort(),
      count: acc.count,
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
      families: familyList,
    },
    skipped,
    duplicates,
  };
}
