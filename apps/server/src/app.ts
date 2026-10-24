import cookieParser from 'cookie-parser';
import express, { type Router } from 'express';
import helmet from 'helmet';
import type { Config } from './config';
import { errorHandler, notFound } from './http/errors';
import type { Logger } from './logger';

export interface HealthChecks {
  db: () => Promise<unknown>;
  redis: () => Promise<unknown>;
}

export interface AppDeps {
  config: Config;
  logger: Logger;
  health: HealthChecks;
  /** Feature routers, mounted in order before the 404 handler. */
  routers?: Router[];
}

const settle = async (check: () => Promise<unknown>) => {
  try {
    await check();
    return true;
  } catch {
    return false;
  }
};

/**
 * The HTTP app. The web app reaches it same-origin through Next rewrites and native apps do
 * not need CORS, so no CORS headers are sent (cross-site browser calls are refused).
 */
export function createApp({ config, logger, health, routers = [] }: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');
  // The Next server (or a load balancer in production) is the proxy in front of us.
  app.set('trust proxy', config.production ? 1 : 'loopback');
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    const start = performance.now();
    res.on('finish', () => {
      logger.info(
        {
          method: req.method,
          url: req.path,
          status: res.statusCode,
          ms: Math.round(performance.now() - start),
        },
        'request',
      );
    });
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/ready', async (_req, res) => {
    const [db, redis] = await Promise.all([settle(health.db), settle(health.redis)]);
    const ok = db && redis;
    res
      .status(ok ? 200 : 503)
      .json({ status: ok ? 'ready' : 'unavailable', checks: { db, redis } });
  });

  for (const router of routers) app.use(router);
  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
