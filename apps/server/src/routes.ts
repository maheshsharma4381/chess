import type { Router } from 'express';
import type { Config } from './config';
import type { PrismaClient } from './db';
import type { Logger } from './logger';
import type { Redis } from './redis';

export interface ServiceDeps {
  config: Config;
  logger: Logger;
  prisma: PrismaClient;
  redis: Redis;
}

/** Every feature router, in mount order. */
export function buildRouters(_deps: ServiceDeps): Router[] {
  return [];
}
