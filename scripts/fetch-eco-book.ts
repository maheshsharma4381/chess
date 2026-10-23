/**
 * Downloads the Lichess chess-openings TSVs and compiles
 * packages/chess-core/src/data/eco-book.json (byEpd O(1) map + byEco catalog + families).
 * Offline: keeps an existing full book, otherwise compiles the built-in 150-opening seed.
 * Run with `pnpm fetch-eco`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { EcoBook } from '@chess/types';
import { compileBook } from './src/eco/compileBook';
import { fetchSources, resolveFallback } from './src/eco/fetchSources';
import type { RawOpening } from './src/eco/parseTsv';
import { ECO_SEED } from './src/eco/seed';

const BOOK_PATH = resolve(import.meta.dirname, '../packages/chess-core/src/data/eco-book.json');
const MIN_FULL_BOOK = 3400;

function readExisting(): Pick<EcoBook, 'source'> | null {
  if (!existsSync(BOOK_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BOOK_PATH, 'utf8')) as EcoBook;
  } catch {
    return null;
  }
}

let rows: RawOpening[];
let source: EcoBook['source'];
try {
  rows = await fetchSources();
  source = 'lichess';
} catch (err) {
  console.warn(`Download failed: ${(err as Error).message}`);
  if (resolveFallback(readExisting()).action === 'keep') {
    console.warn(`Keeping the existing Lichess book at ${BOOK_PATH}`);
    process.exit(0);
  }
  console.warn(`Compiling the built-in ${ECO_SEED.length}-opening seed instead`);
  rows = ECO_SEED;
  source = 'seed';
}

const { book, skipped, duplicates } = compileBook(rows, {
  source,
  generatedAt: new Date().toISOString(),
});

if (source === 'lichess' && book.count < MIN_FULL_BOOK) {
  throw new Error(
    `Only ${book.count} openings compiled (expected >= ${MIN_FULL_BOOK}); not writing`,
  );
}

mkdirSync(dirname(BOOK_PATH), { recursive: true });
writeFileSync(BOOK_PATH, JSON.stringify(book));

console.log(
  `Wrote ${book.count} openings (${book.families.length} families, source: ${source}) to ${BOOK_PATH}`,
);
console.log(`Rows: ${rows.length}, duplicates: ${duplicates}, skipped: ${skipped.length}`);
for (const line of skipped) console.warn(`  skipped ${line}`);
