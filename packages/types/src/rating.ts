export interface Glicko2Rating {
  rating: number;
  /** Rating deviation (Glicko scale). */
  rd: number;
  volatility: number;
}

export interface GameResult {
  opponent: Glicko2Rating;
  /** 1 = win, 0.5 = draw, 0 = loss, from the rated player's side. */
  score: 0 | 0.5 | 1;
}
