import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { usernameSchema } from '../auth/routes';
import { isUniqueViolation, type Prisma } from '../db';
import { HttpError, parseBody } from '../http/errors';
import type { ServiceDeps } from '../routes';
import { publicView, selfView } from './view';

/** Plan ruling R6: avatars are presets, not uploads. */
export const AVATARS = Array.from(
  { length: 12 },
  (_, i) => `avatar-${String(i + 1).padStart(2, '0')}`,
);

const settingsSchema = z
  .object({
    boardTheme: z.enum(['green', 'wood', 'icy-sea', 'glass']),
    pieceSet: z.enum(['cburnett']),
    sound: z.boolean(),
    coachLang: z.enum(['en', 'hinglish']),
  })
  .partial()
  .strict();

const profilePatch = z
  .object({
    displayName: z.string().trim().min(1, 'Required').max(40, 'At most 40 characters'),
    username: usernameSchema,
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'Use a two-letter country code')
      .nullable(),
    bio: z.string().trim().max(200, 'At most 200 characters').nullable(),
    avatar: z.enum(AVATARS as [string, ...string[]], { error: 'Pick one of the avatars' }),
    settings: settingsSchema,
  })
  .partial()
  .strict();

const taken = () => new HttpError(409, 'Username taken', { username: 'Username taken' });

export function usersRouter(deps: ServiceDeps, auth: { requireAuth: RequestHandler }): Router {
  const { prisma } = deps;
  const router = Router();

  router.get('/api/me', auth.requireAuth, async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    res.json({ user: selfView(user) });
  });

  router.patch('/api/me', auth.requireAuth, async (req, res) => {
    const body = parseBody(profilePatch, req.body);
    const current = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const data: Prisma.UserUpdateInput = {};
    if (body.displayName !== undefined) data.displayName = body.displayName;
    if (body.country !== undefined) data.country = body.country;
    if (body.bio !== undefined) data.bio = body.bio || null;
    if (body.avatar !== undefined) data.avatar = body.avatar;
    if (body.username !== undefined) {
      const username = body.username.toLowerCase();
      if (username !== current.username) {
        if (await prisma.user.findUnique({ where: { username } })) throw taken();
        data.username = username;
      }
    }
    if (body.settings) {
      const previous = (current.settings ?? {}) as Record<string, unknown>;
      data.settings = { ...previous, ...body.settings };
    }
    try {
      const user = await prisma.user.update({ where: { id: current.id }, data });
      res.json({ user: selfView(user) });
    } catch (err) {
      if (isUniqueViolation(err)) throw taken();
      throw err;
    }
  });

  router.get('/api/users/:username', async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { username: req.params['username']!.toLowerCase() },
      include: { ratings: true },
    });
    if (!user) throw new HttpError(404, 'No such player');
    const ratings = Object.fromEntries(
      user.ratings.map((r) => [
        r.pool,
        { rating: Math.round(r.rating), rd: Math.round(r.rd), games: r.games },
      ]),
    );
    res.json({ user: publicView(user), ratings });
  });

  return router;
}
