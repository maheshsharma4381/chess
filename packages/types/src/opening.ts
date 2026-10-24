/** ECO code, "A00" through "E99". */
export type EcoCode = string;

export interface OpeningEntry {
  eco: EcoCode;
  name: string;
  /** SAN movetext, e.g. "1. e4 c5". */
  pgn: string;
  /** Space-separated UCI moves, e.g. "e2e4 c7c5". */
  uci: string;
}

/** The deepest named book opening reached in a game. */
export interface BookOpening {
  eco: EcoCode;
  name: string;
  pgn: string;
  /** Last ply (1-based) whose position is in book, named or interior. */
  lastBookPly: number;
}

export interface OpeningTrack {
  opening: BookOpening | null;
  /** Whether the latest ply is still a book move. */
  isBookMove: boolean;
  /** First ply (1-based) that left book, or null if the game never left it. */
  deviationPly: number | null;
  /** bookPlies[i] is true when ply i + 1 is a book move. */
  bookPlies: boolean[];
}

export interface BookMove {
  uci: string;
  san: string;
  /** Named entry for the resulting position, or null for an interior book position. */
  opening: OpeningEntry | null;
}

export type WhiteFirstMove = '1.e4' | '1.d4' | '1.c4' | '1.Nf3' | 'Flank';

export interface OpeningFamily {
  /** Family name: the part of the opening name before ":", e.g. "Sicilian Defense". */
  name: string;
  /** "black" for counter-defenses (Sicilian, French, QGD...), "white" for White systems. */
  side: 'white' | 'black';
  firstMove: WhiteFirstMove;
  ecoCodes: EcoCode[];
  count: number;
  /** Every book position (EPD key into EcoBook.byEpd) in this family, in source order. */
  epds: string[];
}

export interface EcoBook {
  version: 1;
  source: 'lichess' | 'seed';
  generatedAt: string;
  count: number;
  /** Normalized EPD (first 4 FEN fields) -> opening. */
  byEpd: Record<string, OpeningEntry>;
  /** ECO code -> EPD keys into byEpd. */
  byEco: Record<EcoCode, string[]>;
  /**
   * Unnamed positions that lie on a book line (e.g. after 4.Nxd4 in the Open Sicilian).
   * They are theory, so they count as book moves, but they carry no name of their own.
   */
  interior: string[];
  families: OpeningFamily[];
}
