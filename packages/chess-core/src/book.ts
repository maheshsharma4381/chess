/**
 * `@chess/chess-core/book`: the 1.7 MB opening book on its own entry, so pages can load it
 * lazily (`await import('@chess/chess-core/book')`) instead of bundling it with the math.
 */
export { loadEcoBook } from './opening/ecoBook';
export { BOOK_PLY_LIMIT, OpeningLookupService } from './opening/OpeningLookupService';
