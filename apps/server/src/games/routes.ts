import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { RATING_POOLS } from '../db';
import { HttpError, parseBody } from '../http/errors';
import type { ServiceDeps } from '../routes';
import { gameView, outcomeFor, saveGame, saveGameBody } from './service';

const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(64).optional(),
});

export function gamesRouter(deps: ServiceDeps, auth: { requireAuth: RequestHandler }): Router {
  const { prisma } = deps;
  const router = Router();

  const userByName = async (username: string) => {
    const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    if (!user) throw new HttpError(404, 'No such player');
    return user;
  };

  router.post('/api/games', auth.requireAuth, async (req, res) => {
    const body = parseBody(saveGameBody, req.body);
    const { game, created } = await saveGame(prisma, req.user!.id, body);
    res.status(created ? 201 : 200).json({ game: gameView(game) });
  });

  router.get('/api/games/:id', async (req, res) => {
    const game = await prisma.game.findUnique({ where: { id: req.params['id']! } });
    if (!game) throw new HttpError(404, 'No such game');
    res.json({ game: gameView(game) });
  });

  router.get('/api/users/:username/games', async (req, res) => {
    const { limit, cursor } = parseBody(pageQuery, req.query);
    const user = await userByName(req.params['username']!);
    const games = await prisma.game.findMany({
      where: { userId: user.id },
      orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = games.slice(0, limit);
    res.json({
      games: page.map(gameView),
      nextCursor: games.length > limit ? (page.at(-1)?.id ?? null) : null,
    });
  });

  router.get('/api/users/:username/stats', async (req, res) => {
    const user = await userByName(req.params['username']!);
    const games = await prisma.game.findMany({
      where: { userId: user.id },
      select: { result: true, userColor: true, botId: true },
    });
    const total = { total: 0, wins: 0, draws: 0, losses: 0 };
    const byBot: Record<string, { wins: number; draws: number; losses: number }> = {};
    for (const game of games) {
      const outcome = outcomeFor(game);
      total.total++;
      if (!outcome) continue;
      const key = outcome === 'win' ? 'wins' : outcome === 'draw' ? 'draws' : 'losses';
      total[key]++;
      if (game.botId) {
        byBot[game.botId] ??= { wins: 0, draws: 0, losses: 0 };
        byBot[game.botId]![key]++;
      }
    }
    res.json({ ...total, byBot });
  });

  router.get('/api/users/:username/ratings/:pool', async (req, res) => {
    const pool = parseBody(
      z.enum(RATING_POOLS, { error: 'Unknown rating pool' }),
      req.params['pool'],
    );
    const user = await userByName(req.params['username']!);
    const events = await prisma.ratingEvent.findMany({
      where: { userId: user.id, pool },
      orderBy: { createdAt: 'asc' },
    });
    res.json({
      pool,
      history: events.map((e) => ({
        rating: Math.round(e.rating),
        rd: Math.round(e.rd),
        gameId: e.gameId,
        at: e.createdAt.toISOString(),
      })),
    });
  });

  return router;
}
