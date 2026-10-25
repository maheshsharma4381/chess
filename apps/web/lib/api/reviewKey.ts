import { Chess } from 'chess.js';
import { parsePgn } from '@chess/chess-core';

/**
 * The server's review cache key (apps/server src/reviews/key.ts): SHA-256 of the start FEN
 * and the SAN moves, so a cached server report can be looked up without queueing a job.
 */
export async function browserReviewKey(pgn: string): Promise<string> {
  const parsed = parsePgn(pgn);
  const chess = parsed.startFen ? new Chess(parsed.startFen) : new Chess();
  const start = chess.fen();
  const sans = parsed.sans.map((san) => chess.move(san).san);
  const bytes = new TextEncoder().encode(`${start}\n${sans.join(' ')}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
