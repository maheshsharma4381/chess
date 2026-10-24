import type { Chess } from 'chess.js';
import { z } from 'zod';
import { isUniqueViolation, type PrismaClient } from '../db';
import type { Game } from '../generated/prisma/client';
import { HttpError } from '../http/errors';
import { reviewKey } from '../reviews/key';

export const RESULTS = ['1-0', '0-1', '1/2-1/2', '*'] as const;
export const TERMINATIONS = [
  'checkmate',
  'resign',
  'timeout',
  'stalemate',
  'insufficient',
  'threefold',
  'fifty-move',
  'agreement',
  'abandoned',
  'aborted',
] as const;

export const saveGameBody = z
  .object({
    pgn: z.string().min(1).max(100_000),
    clientGameId: z.string().regex(/^[\w-]{8,64}$/, '8-64 letters, digits, _ or -'),
    botId: z
      .string()
      .regex(/^[\w-]{1,40}$/)
      .optional(),
    userColor: z.enum(['white', 'black'], { error: 'white or black' }),
    termination: z.enum(TERMINATIONS),
    result: z.enum(RESULTS).optional(),
    timeControl: z.string().max(20).optional(),
  })
  .strict();
export type SaveGameBody = z.infer<typeof saveGameBody>;

/** The result the board itself decides, or null when the game could have gone on. */
function boardResult(chess: Chess): (typeof RESULTS)[number] | null {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? '0-1' : '1-0';
  if (chess.isDraw() || chess.isStalemate()) return '1/2-1/2';
  return null;
}

function headers(pgn: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of pgn.matchAll(/^\s*\[(\w+)\s+"([^"]*)"\]\s*$/gm)) out[m[1]!] = m[2]!;
  return out;
}

export function gameView(game: Game) {
  return {
    id: game.id,
    whiteName: game.whiteName,
    blackName: game.blackName,
    botId: game.botId,
    userColor: game.userColor,
    pgn: game.pgn,
    startFen: game.startFen,
    result: game.result,
    termination: game.termination,
    timeControl: game.timeControl,
    rated: game.rated,
    plies: game.plies,
    reviewKey: game.reviewKey,
    playedAt: game.playedAt.toISOString(),
  };
}

/**
 * Stores a finished game for its owner. The server replays the moves, settles the result
 * from the final position when the board decides it, and rewrites the PGN with that result.
 * Saving the same clientGameId again returns the stored game (`created: false`).
 */
export async function saveGame(
  prisma: PrismaClient,
  userId: string,
  body: SaveGameBody,
): Promise<{ game: Game; created: boolean }> {
  const existing = await prisma.game.findUnique({
    where: { userId_clientGameId: { userId, clientGameId: body.clientGameId } },
  });
  if (existing) return { game: existing, created: false };

  const replay = reviewKey(body.pgn);
  const tags = headers(body.pgn);
  const decided = boardResult(replay.chess);
  if (decided && body.result && body.result !== decided) {
    throw new HttpError(400, 'Result does not match the final position');
  }
  const headerResult = (RESULTS as readonly string[]).includes(tags['Result'] ?? '')
    ? (tags['Result'] as (typeof RESULTS)[number])
    : undefined;
  const result = decided ?? body.result ?? headerResult ?? '*';

  const chess = replay.chess;
  for (const [name, value] of Object.entries(tags)) {
    if (name !== 'Result' && name !== 'SetUp' && name !== 'FEN') chess.setHeader(name, value);
  }
  chess.setHeader('Result', result);

  try {
    const game = await prisma.game.create({
      data: {
        userId,
        clientGameId: body.clientGameId,
        whiteName: (tags['White'] ?? 'White').slice(0, 60),
        blackName: (tags['Black'] ?? 'Black').slice(0, 60),
        botId: body.botId,
        userColor: body.userColor,
        pgn: chess.pgn(),
        startFen: replay.startFen,
        result,
        termination: body.termination,
        timeControl: body.timeControl,
        // Bot games are unrated (spec); rated pools start with live play in Phase 5.
        rated: false,
        plies: replay.sans.length,
        reviewKey: replay.key,
      },
    });
    return { game, created: true };
  } catch (err) {
    // The same game saved twice at once: the other request stored it.
    if (!isUniqueViolation(err)) throw err;
    const game = await prisma.game.findUniqueOrThrow({
      where: { userId_clientGameId: { userId, clientGameId: body.clientGameId } },
    });
    return { game, created: false };
  }
}

type Outcome = 'win' | 'draw' | 'loss' | null;
export function outcomeFor(game: Pick<Game, 'result' | 'userColor'>): Outcome {
  if (game.result === '1/2-1/2') return 'draw';
  if (game.result === '*' || !game.userColor) return null;
  const whiteWon = game.result === '1-0';
  return whiteWon === (game.userColor === 'white') ? 'win' : 'loss';
}
