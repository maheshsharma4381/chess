import { Router } from 'express';
import { z } from 'zod';
import { RATING_POOLS, isUniqueViolation, type PrismaClient } from '../db';
import { HttpError, parseBody } from '../http/errors';
import { rateLimit } from '../http/rateLimit';
import type { ServiceDeps } from '../routes';
import { selfView } from '../users/view';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearAuth, issueAuth } from './middleware';
import { decoyHash, hashPassword, verifyPassword } from './password';
import { createSession, revokeFamily, rotateSession, sessionByRefreshToken } from './sessions';
import { verifyAccess } from './tokens';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address' }));
export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{3,20}$/, '3-20 letters, digits or underscores');

const signupBody = z.object({
  email: emailSchema,
  password: z.string().min(8, 'At least 8 characters').max(128, 'At most 128 characters'),
  username: usernameSchema,
});
const loginBody = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

const taken = (field: 'email' | 'username') => {
  const message = field === 'email' ? 'Email already registered' : 'Username taken';
  return new HttpError(409, message, { [field]: message });
};

/** Creates the account with its five rating pools and their first history point. */
export async function createUser(
  prisma: PrismaClient,
  data: {
    email: string;
    username: string;
    displayName: string;
    passwordHash?: string;
    googleSub?: string;
  },
) {
  const username = data.username.toLowerCase();
  const [byEmail, byName] = await Promise.all([
    prisma.user.findUnique({ where: { email: data.email } }),
    prisma.user.findUnique({ where: { username } }),
  ]);
  if (byEmail) throw taken('email');
  if (byName) throw taken('username');
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { ...data, username } });
      await tx.rating.createMany({ data: RATING_POOLS.map((pool) => ({ userId: user.id, pool })) });
      await tx.ratingEvent.createMany({
        data: RATING_POOLS.map((pool) => ({ userId: user.id, pool, rating: 1500, rd: 350 })),
      });
      return user;
    });
  } catch (err) {
    // A sign-up racing this one won the unique index; report which field it took.
    if (!isUniqueViolation(err)) throw err;
    throw (await prisma.user.findUnique({ where: { email: data.email } }))
      ? taken('email')
      : taken('username');
  }
}

export function authRouter(deps: ServiceDeps): Router {
  const { config, prisma, redis, redisPrefix, now } = deps;
  const router = Router();
  const ip = (req: { ip?: string }) => req.ip ?? 'unknown';

  router.post(
    '/api/auth/signup',
    rateLimit({ redis, prefix: redisPrefix, name: 'signup', key: ip, limit: 5, windowSec: 3600 }),
    async (req, res) => {
      const body = parseBody(signupBody, req.body);
      const user = await createUser(prisma, {
        email: body.email,
        username: body.username,
        displayName: body.username,
        passwordHash: await hashPassword(body.password),
      });
      const issued = await createSession(prisma, user.id, {
        now: now(),
        userAgent: req.get('user-agent'),
      });
      const tokens = await issueAuth(
        res,
        req,
        config,
        { userId: user.id, sessionId: issued.session.id, refreshToken: issued.refreshToken },
        now(),
      );
      res.status(201).json({ user: selfView(user), ...tokens });
    },
  );

  router.post(
    '/api/auth/login',
    rateLimit({
      redis,
      prefix: redisPrefix,
      name: 'login',
      key: (req) => {
        const email =
          typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        return `${ip(req)}:${email}`;
      },
      limit: 10,
      windowSec: 15 * 60,
    }),
    async (req, res) => {
      const body = parseBody(loginBody, req.body);
      const user = await prisma.user.findUnique({ where: { email: body.email } });
      // Unknown emails still pay for a hash comparison, so timing does not reveal accounts.
      const ok = await verifyPassword(body.password, user?.passwordHash ?? (await decoyHash()));
      if (!user || !user.passwordHash || !ok) throw new HttpError(401, 'Wrong email or password');
      const issued = await createSession(prisma, user.id, {
        now: now(),
        userAgent: req.get('user-agent'),
      });
      const tokens = await issueAuth(
        res,
        req,
        config,
        { userId: user.id, sessionId: issued.session.id, refreshToken: issued.refreshToken },
        now(),
      );
      res.json({ user: selfView(user), ...tokens });
    },
  );

  router.post('/api/auth/refresh', async (req, res) => {
    const token =
      (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE] ??
      (typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined);
    if (!token) throw new HttpError(401, 'Sign in required');
    const result = await rotateSession(prisma, token, {
      now: now(),
      userAgent: req.get('user-agent'),
    });
    if (result === 'invalid' || result === 'reused') {
      clearAuth(res, config);
      throw new HttpError(401, 'Session expired. Sign in again.');
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id: result.session.userId } });
    const tokens = await issueAuth(
      res,
      req,
      config,
      { userId: user.id, sessionId: result.session.id, refreshToken: result.refreshToken },
      now(),
    );
    res.json({ user: selfView(user), ...tokens });
  });

  router.post('/api/auth/logout', async (req, res) => {
    const cookies = (req.cookies as Record<string, string> | undefined) ?? {};
    const refresh =
      cookies[REFRESH_COOKIE] ??
      (typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined);
    let family: string | null = null;
    if (refresh) family = (await sessionByRefreshToken(prisma, refresh))?.family ?? null;
    if (!family) {
      const header = req.get('authorization');
      const access = header?.startsWith('Bearer ') ? header.slice(7) : cookies[ACCESS_COOKIE];
      if (access) {
        try {
          const { sessionId } = await verifyAccess(access, config.authSecret, now());
          family = (await prisma.session.findUnique({ where: { id: sessionId } }))?.family ?? null;
        } catch {
          // An expired access token alone cannot identify the session; the cookies are cleared anyway.
        }
      }
    }
    if (family) await revokeFamily(prisma, family, now());
    clearAuth(res, config);
    res.status(204).end();
  });

  return router;
}
