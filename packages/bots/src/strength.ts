import { Chess } from 'chess.js';
import type { BotProfile, EngineLine, Score } from '@chess/types';
import { pick } from './rng';

/** Stockfish cannot limit itself below this (UCI_Elo floor); weaker bots sample candidates instead. */
export const ENGINE_ELO_FLOOR = 1320;
/** Bots at or above this rating play at Stockfish's full strength. */
export const FULL_STRENGTH_RATING = 3200;

export interface BotSearchParams {
  multiPv: number;
  depth?: number;
  movetime: number;
  /** Set when Stockfish's own strength limit is used. */
  elo?: number;
}

/** Linear interpolation over [rating, value] points, clamped at the ends. */
function curve(rating: number, points: ReadonlyArray<readonly [number, number]>): number {
  const first = points[0] as readonly [number, number];
  const last = points[points.length - 1] as readonly [number, number];
  if (rating <= first[0]) return first[1];
  if (rating >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [r1, v1] = points[i] as readonly [number, number];
    const [r0, v0] = points[i - 1] as readonly [number, number];
    if (rating <= r1) return v0 + ((rating - r0) / (r1 - r0)) * (v1 - v0);
  }
  return last[1];
}

/** Softmax temperature in centipawns: higher = more willing to play worse moves. */
const TEMPERATURE: ReadonlyArray<readonly [number, number]> = [
  [250, 400],
  [400, 300],
  [650, 200],
  [1000, 120],
  [1300, 60],
];

/** Chance of ignoring the engine and playing any legal move. */
const BLUNDER_CHANCE: ReadonlyArray<readonly [number, number]> = [
  [250, 0.25],
  [400, 0.15],
  [650, 0.08],
  [1000, 0.03],
  [1300, 0.01],
];

/** What to ask the engine for, per bot (plan ruling R1). */
export function botSearchParams(bot: BotProfile): BotSearchParams {
  if (bot.rating >= FULL_STRENGTH_RATING) return { multiPv: 1, movetime: 1500 };
  if (bot.rating >= ENGINE_ELO_FLOOR) return { multiPv: 1, movetime: 800, elo: bot.rating };
  return {
    multiPv: bot.rating <= 700 ? 8 : bot.rating <= 1000 ? 6 : 5,
    depth: bot.rating <= 400 ? 4 : bot.rating <= 700 ? 6 : bot.rating <= 1000 ? 8 : 10,
    movetime: 400,
  };
}

export interface BotMoveContext {
  fen: string;
  /** 1-based ply of the move the bot is about to play. */
  ply: number;
  /** Engine lines for the bot's position (side-to-move POV), best first. */
  lines: EngineLine[];
  legalUci: string[];
}

const EARLY_PLIES = 10;
const MATE_CP = 10_000;

const cpOf = (score: Score) =>
  'mate' in score ? Math.sign(score.mate) * (MATE_CP - Math.abs(score.mate)) : score.cp;

/**
 * The bot's move: the engine's choice for strong bots; for weaker ones a softmax pick over
 * candidate lines (rating-dependent temperature) with an occasional random blunder, then
 * personality biases. Always returns a legal move.
 */
export function chooseBotMove(bot: BotProfile, ctx: BotMoveContext, rng: () => number): string {
  const legal = new Set(ctx.legalUci);
  const lines = ctx.lines.filter((l) => legal.has(l.uci));
  const best = lines[0];
  if (!best) return pick(ctx.legalUci, rng);
  if (bot.rating >= ENGINE_ELO_FLOOR && !bot.style.earlyQueen) return best.uci;

  const chess = new Chess(ctx.fen);
  const pieceOf = (uci: string) => chess.get(uci.slice(0, 2) as Parameters<Chess['get']>[0])?.type;

  // Personality: the early queen sortie, when it isn't a disaster.
  const { earlyQueen = 0, earlyQueenToleranceCp = 150, aggression = 0 } = bot.style;
  if (earlyQueen > 0 && ctx.ply <= EARLY_PLIES && rng() < earlyQueen) {
    const queenMove = lines.find(
      (l) => pieceOf(l.uci) === 'q' && cpOf(best.score) - cpOf(l.score) <= earlyQueenToleranceCp,
    );
    if (queenMove) return queenMove.uci;
  }
  if (bot.rating >= ENGINE_ELO_FLOOR) return best.uci;

  if (rng() < curve(bot.rating, BLUNDER_CHANCE)) return pick(ctx.legalUci, rng);

  const temperature = curve(bot.rating, TEMPERATURE);
  const forcingMoves = new Set(
    aggression > 0
      ? chess
          .moves({ verbose: true })
          .filter((m) => m.captured || m.san.includes('+'))
          .map((m) => m.lan)
      : [],
  );
  const forcing = (uci: string) => forcingMoves.has(uci);
  const weights = lines.map((l) => {
    const w = Math.exp((cpOf(l.score) - cpOf(best.score)) / temperature);
    return aggression > 0 && forcing(l.uci) ? w * (1 + aggression) : w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const [i, l] of lines.entries()) {
    r -= weights[i] as number;
    if (r <= 0) return l.uci;
  }
  return best.uci;
}
