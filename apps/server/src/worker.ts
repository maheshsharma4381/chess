import { loadConfig } from './config';
import { createPrisma } from './db';
import { createLogger } from './logger';
import { createRedis } from './redis';
import { startReviewWorker } from './reviews/queue';

/** The review worker process: `pnpm --filter @chess/server worker`. */
const config = loadConfig();
const logger = createLogger({ level: config.logLevel });
const prisma = createPrisma(config.databaseUrl, config.dbSchema);
const redis = createRedis(config.redisUrl);

const worker = startReviewWorker({
  redis,
  prisma,
  prefix: 'chess:',
  logger,
  stockfishPath: config.stockfishPath,
});
logger.info(
  { engine: config.stockfishPath ?? 'stockfish wasm (lite, single-threaded)' },
  'review worker started',
);

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, 'review worker stopping');
  // Finish the job in hand; a hard kill instead leaves it to the stalled-job check.
  await worker.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
