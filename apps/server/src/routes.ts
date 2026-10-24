import type { Router } from 'express';
import { googleRouter, type GoogleDeps } from './auth/google';
import { authMiddleware } from './auth/middleware';
import { authRouter } from './auth/routes';
import type { Config } from './config';
import type { PrismaClient } from './db';
import type { Logger } from './logger';
import type { Redis } from './redis';
import { usersRouter } from './users/routes';

export interface ServiceDeps {
  config: Config;
  logger: Logger;
  prisma: PrismaClient;
  redis: Redis;
  /** Namespaces every Redis key this instance writes. */
  redisPrefix: string;
  now: () => Date;
  /** Overrides Google's token endpoint and keys (tests). */
  google?: GoogleDeps;
}

/** Every feature router, in mount order. */
export function buildRouters(deps: ServiceDeps): Router[] {
  const auth = authMiddleware(deps);
  return [authRouter(deps), googleRouter(deps), usersRouter(deps, auth)];
}
