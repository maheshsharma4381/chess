/** Scharnagl numbering: index 518 is the standard RNBQKBNR start. */
export const CHESS960_STANDARD_INDEX = 518;
export const CHESS960_POSITIONS = 960;

/** Knight placements over the five squares left after bishops and queen (Scharnagl's table). */
const KNIGHTS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 3],
  [2, 4],
  [3, 4],
];

function backRank(index: number): string {
  const rank: Array<string | null> = Array(8).fill(null);
  const emptyFiles = () => rank.flatMap((p, f) => (p === null ? [f] : []));
  const placeOnEmpty = (nth: number, piece: string) => {
    rank[emptyFiles()[nth] as number] = piece;
  };

  let n = index;
  rank[(n % 4) * 2 + 1] = 'B'; // light-squared bishop: b, d, f, h
  n = Math.floor(n / 4);
  rank[(n % 4) * 2] = 'B'; // dark-squared bishop: a, c, e, g
  n = Math.floor(n / 4);
  placeOnEmpty(n % 6, 'Q');
  n = Math.floor(n / 6);

  const [first, second] = KNIGHTS[n] as readonly [number, number];
  const empties = emptyFiles();
  rank[empties[first] as number] = 'N';
  rank[empties[second] as number] = 'N';

  const [a, b, c] = emptyFiles() as [number, number, number];
  rank[a] = 'R';
  rank[b] = 'K';
  rank[c] = 'R';
  return rank.join('');
}

/**
 * Starting FEN for a Chess960 position. Castling uses X-FEN `KQkq` (outermost rooks).
 *
 * chess.js applies standard castling geometry to these rights, so it must not be used
 * to play Chess960 games that castle; the Chess960 castling layer arrives with live
 * 960 games (Phase 5). Index 518 is safe everywhere.
 */
export function chess960StartFen(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= CHESS960_POSITIONS) {
    throw new RangeError(`Chess960 index must be an integer 0..959, got ${index}`);
  }
  const white = backRank(index);
  return `${white.toLowerCase()}/pppppppp/8/8/8/8/PPPPPPPP/${white} w KQkq - 0 1`;
}

export function randomChess960Index(random: () => number = Math.random): number {
  return Math.min(CHESS960_POSITIONS - 1, Math.floor(random() * CHESS960_POSITIONS));
}
