import { Chess } from 'chess.js';
import type { BookMove, EcoBook, OpeningEntry, OpeningTrack } from '@chess/types';
import { normalizeEpd } from '../epd';

/** Book moves only count within the first 20 moves. */
export const BOOK_PLY_LIMIT = 40;

const epdOf = (chessJsFen: string) => chessJsFen.split(' ').slice(0, 4).join(' ');

export class OpeningLookupService {
  private readonly interior: ReadonlySet<string>;

  constructor(private readonly book: EcoBook) {
    this.interior = new Set(book.interior);
  }

  /** O(1) lookup of the named opening for a position (counters and ep are normalized). */
  getOpeningByFen(fen: string): OpeningEntry | null {
    return this.book.byEpd[normalizeEpd(fen)] ?? null;
  }

  /** True if the position lies on any book line, named or not. */
  isBookPosition(fen: string): boolean {
    return this.isBookEpd(normalizeEpd(fen));
  }

  /** Legal moves from `fen` that stay in book: the theoretical continuations. */
  bookMovesFrom(fen: string): BookMove[] {
    const moves = new Chess(fen).moves({ verbose: true });
    return moves
      .filter((m) => this.isBookEpd(epdOf(m.after)))
      .map((m) => ({
        uci: m.from + m.to + (m.promotion ?? ''),
        san: m.san,
        opening: this.book.byEpd[epdOf(m.after)] ?? null,
      }))
      .sort((a, b) => (a.san < b.san ? -1 : a.san > b.san ? 1 : 0));
  }

  /** `fenHistory[0]` is the starting position; `fenHistory[i]` is the position after ply i. */
  trackGameOpening(fenHistory: string[]): OpeningTrack {
    const bookPlies: boolean[] = [];
    let opening: OpeningTrack['opening'] = null;
    let named: OpeningEntry | null = null;
    let lastBookPly = 0;
    let deviationPly: number | null = null;

    for (let ply = 1; ply < fenHistory.length; ply++) {
      const epd = normalizeEpd(fenHistory[ply] as string);
      const inBook = ply <= BOOK_PLY_LIMIT && this.isBookEpd(epd);
      bookPlies.push(inBook);
      if (!inBook) {
        deviationPly ??= ply;
        continue;
      }
      lastBookPly = ply;
      named = this.book.byEpd[epd] ?? named;
    }

    if (named) opening = { eco: named.eco, name: named.name, pgn: named.pgn, lastBookPly };
    return { opening, isBookMove: bookPlies.at(-1) ?? false, deviationPly, bookPlies };
  }

  private isBookEpd(epd: string): boolean {
    return epd in this.book.byEpd || this.interior.has(epd);
  }
}
