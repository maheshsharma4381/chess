import { createServer } from 'node:http';
import { createApp } from './app';
import { loadConfig } from './config';
import { createPrisma } from './db';
import { createLogger } from './logger';
import { attachSocket } from './realtime';
import { createRedis } from './redis';
import { buildRouters } from './routes';

const config = loadConfig();
const logger = createLogger({ level: config.logLevel });
const prisma = createPrisma(config.databaseUrl, config.dbSchema);
const redis = createRedis(config.redisUrl);

const app = createApp({
  config,
  logger,
  health: { db: () => prisma.$queryRaw`SELECT 1`, redis: () => redis.ping() },
  routers: buildRouters({ config, logger, prisma, redis }),
});
const server = createServer(app);
const io = attachSocket(server, { logger });

server.listen(config.port, () => logger.info({ port: config.port }, 'server listening'));

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, 'shutting down');
  // Stop taking connections, let in-flight requests finish, then close the pools.
  await io.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
