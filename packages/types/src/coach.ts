export type MotifType =
  | 'book'
  | 'book-deviation'
  | 'hanging-piece'
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovered-attack'
  | 'discovered-check'
  | 'back-rank'
  | 'mate-threat'
  | 'sacrifice'
  | 'center-control'
  | 'king-safety'
  | 'pawn-structure'
  | 'development';

export interface Motif {
  type: MotifType;
  /** Squares involved, most important first (e.g. forking piece, then targets). */
  squares: string[];
  /** Values the coach templates interpolate (piece names, opening names, SAN). */
  detail: Record<string, string | number>;
}

export type CoachLanguage = 'en' | 'hinglish';

export interface CoachExplanation {
  /** e.g. "Nxf7!! is a Brilliant move". */
  headline: string;
  /** e.g. "+0.3 → +2.4" (White POV, pawns or M<n>). */
  evalChange: string;
  text: string;
  motifs: MotifType[];
}
