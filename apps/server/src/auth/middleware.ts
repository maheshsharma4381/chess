import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import type { Config } from '../config';
import type { PrismaClient } from '../db';
import { HttpError } from '../http/errors';
import { REFRESH_TTL_MS, liveSession } from './sessions';
import { ACCESS_TTL_SECONDS, signAccess, verifyAccess } from './tokens';

export const ACCESS_COOKIE = 'chess_access';
export const REFRESH_COOKIE = 'chess_refresh';
const REFRESH_PATH = '/api/auth';

export interface AuthUser {
  id: string;
  sessionId: string;
}

declare global {
  // Express's Request extends this global namespace interface.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Native clients send `X-Auth-Mode: token` and keep tokens themselves instead of cookies. */
export const wantsTokens = (req: Request) => req.get('x-auth-mode') === 'token';

function cookieBase(config: Config): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: config.production };
}

export async function issueAuth(
  res: Response,
  req: Request,
  config: Config,
  issued: { userId: string; sessionId: string; refreshToken: string },
  now: Date,
): Promise<{ accessToken?: string; refreshToken?: string }> {
  const accessToken = await signAccess(
    { userId: issued.userId, sessionId: issued.sessionId },
    config.authSecret,
    now,
  );
  if (wantsTokens(req)) return { accessToken, refreshToken: issued.refreshToken };
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...cookieBase(config),
    path: '/',
    maxAge: ACCESS_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, issued.refreshToken, {
    ...cookieBase(config),
    path: REFRESH_PATH,
    maxAge: REFRESH_TTL_MS,
  });
  return {};
}

export function clearAuth(res: Response, config: Config) {
  res.clearCookie(ACCESS_COOKIE, { ...cookieBase(config), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase(config), path: REFRESH_PATH });
}

function bearer(req: Request): string | null {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  const cookie = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
  return cookie || null;
}

/** Resolves `req.user` from a Bearer header or the access cookie; a revoked session counts as none. */
export function authenticate(deps: {
  config: Config;
  prisma: PrismaClient;
  now: () => Date;
}): (req: Request) => Promise<AuthUser | null> {
  return async (req) => {
    const token = bearer(req);
    if (!token) return null;
    let claims;
    try {
      claims = await verifyAccess(token, deps.config.authSecret, deps.now());
    } catch {
      return null;
    }
    const session = await liveSession(deps.prisma, claims.sessionId);
    if (!session || session.userId !== claims.userId) return null;
    return { id: claims.userId, sessionId: claims.sessionId };
  };
}

export function authMiddleware(deps: Parameters<typeof authenticate>[0]): {
  requireAuth: RequestHandler;
  optionalAuth: RequestHandler;
} {
  const resolve = authenticate(deps);
  return {
    requireAuth: async (req, _res, next) => {
      const user = await resolve(req);
      if (!user) throw new HttpError(401, 'Sign in required');
      req.user = user;
      next();
    },
    optionalAuth: async (req, _res, next) => {
      req.user = (await resolve(req)) ?? undefined;
      next();
    },
  };
}
