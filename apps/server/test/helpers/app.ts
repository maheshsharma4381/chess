import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { Express } from 'express';
import { inject } from 'vitest';
import { createApp } from '../../src/app';
import { loadConfig, type Config } from '../../src/config';
import type { PrismaClient } from '../../src/db';
import { createLogger } from '../../src/logger';
import { createRedis, type Redis } from '../../src/redis';
import { buildRouters, type ServiceDeps } from '../../src/routes';

export const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig(
    {
      DATABASE_URL: 'postgresql://unused/db',
      AUTH_SECRET: TEST_SECRET,
      NODE_ENV: 'test',
      ...overrides,
    },
    [],
  );
}

/** A controllable clock: starts now, `advance(ms)` moves it. */
export function fakeClock(start = new Date('2026-10-25T12:00:00Z')) {
  let t = start.getTime();
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
  };
}

export interface TestApp {
  app: Express;
  deps: ServiceDeps;
  redis: Redis;
  /** Deletes this app's Redis keys only (other test files share the server). */
  clearRedis(): Promise<void>;
  close(): Promise<void>;
}

/** The full app over a test database and the shared test Redis (own key prefix). */
export function buildTestApp(
  prisma: PrismaClient,
  opts: { config?: Config; now?: () => Date; extra?: Partial<ServiceDeps> } = {},
): TestApp {
  const redis = createRedis(inject('redisUrl'));
  const logger = createLogger({
    level: 'warn',
    stream: new Writable({ write: (_c, _e, done) => done() }),
  });
  const deps: ServiceDeps = {
    config: opts.config ?? testConfig(),
    logger,
    prisma,
    redis,
    redisPrefix: `test:${randomUUID()}:`,
    now: opts.now ?? (() => new Date()),
    ...opts.extra,
  };
  const app = createApp({
    config: deps.config,
    logger,
    health: { db: () => prisma.$queryRaw`SELECT 1`, redis: () => redis.ping() },
    routers: buildRouters(deps),
  });
  const clearRedis = async () => {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${deps.redisPrefix}*`, 'COUNT', 500);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  };
  return { app, deps, redis, clearRedis, close: async () => void (await redis.quit()) };
}

/** The value of a Set-Cookie for `name`, and its attributes. */
export function cookie(res: { headers: Record<string, unknown> }, name: string) {
  const all = ([] as string[]).concat((res.headers['set-cookie'] as string[] | undefined) ?? []);
  const line = all.find((c) => c.startsWith(`${name}=`));
  if (!line) return null;
  const [pair, ...attrs] = line.split(/;\s*/);
  return {
    value: decodeURIComponent(pair!.slice(name.length + 1)),
    attrs: attrs.map((a) => a.toLowerCase()),
  };
}
