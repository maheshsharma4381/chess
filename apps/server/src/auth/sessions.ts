import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PrismaClient } from '../db';
import type { Session } from '../generated/prisma/client';

export const REFRESH_TTL_MS = 30 * 24 * 3600_000;
/**
 * A rotated token presented again within this window is a race between two tabs (one of them
 * already got the new token), not theft: refuse it, but don't revoke the family.
 */
export const REUSE_GRACE_MS = 10_000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface IssuedSession {
  session: Session;
  refreshToken: string;
}

export async function createSession(
  prisma: PrismaClient,
  userId: string,
  opts: { now: Date; userAgent?: string; family?: string },
): Promise<IssuedSession> {
  const refreshToken = randomBytes(32).toString('base64url');
  const session = await prisma.session.create({
    data: {
      userId,
      family: opts.family ?? randomUUID(),
      refreshHash: hashToken(refreshToken),
      expiresAt: new Date(opts.now.getTime() + REFRESH_TTL_MS),
      userAgent: opts.userAgent?.slice(0, 200),
      createdAt: opts.now,
    },
  });
  return { session, refreshToken };
}

export async function revokeFamily(prisma: PrismaClient, family: string, now: Date): Promise<void> {
  await prisma.session.updateMany({ where: { family, revokedAt: null }, data: { revokedAt: now } });
}

/**
 * Exchanges a refresh token for a new one in the same family.
 * - unknown, expired or revoked → 'invalid'
 * - already rotated within REUSE_GRACE_MS → 'invalid' (a parallel refresh won)
 * - already rotated earlier → 'reused': the family is revoked, since someone replayed it
 */
export async function rotateSession(
  prisma: PrismaClient,
  refreshToken: string,
  opts: { now: Date; userAgent?: string },
): Promise<IssuedSession | 'invalid' | 'reused'> {
  const current = await prisma.session.findUnique({
    where: { refreshHash: hashToken(refreshToken) },
  });
  if (!current || current.revokedAt || current.expiresAt <= opts.now) return 'invalid';
  if (current.rotatedAt) {
    if (opts.now.getTime() - current.rotatedAt.getTime() <= REUSE_GRACE_MS) return 'invalid';
    await revokeFamily(prisma, current.family, opts.now);
    return 'reused';
  }
  // Only one concurrent caller can flip rotatedAt from null; the loser sees count 0.
  const claimed = await prisma.session.updateMany({
    where: { id: current.id, rotatedAt: null, revokedAt: null },
    data: { rotatedAt: opts.now },
  });
  if (claimed.count === 0) return 'invalid';
  return createSession(prisma, current.userId, {
    now: opts.now,
    userAgent: opts.userAgent,
    family: current.family,
  });
}

/**
 * The session behind an access token, unless its family was revoked (logout, replay). A
 * rotated row stays valid: its access token is short-lived anyway.
 */
export async function liveSession(prisma: PrismaClient, sessionId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  return session && !session.revokedAt ? session : null;
}

export async function sessionByRefreshToken(prisma: PrismaClient, refreshToken: string) {
  return prisma.session.findUnique({ where: { refreshHash: hashToken(refreshToken) } });
}
