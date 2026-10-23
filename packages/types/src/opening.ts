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
  families: OpeningFamily[];
}
