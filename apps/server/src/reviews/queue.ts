import { analyzeGame, type EngineAdapter } from '@chess/chess-core';
import { OpeningLookupService, loadEcoBook } from '@chess/chess-core/book';
import { UciEngine } from '@chess/engine';
import { createProcessTransport, stockfishProcessCommand } from '@chess/engine/node';
import { Queue, Worker } from 'bullmq';
import type { PrismaClient } from '../db';
import type { Logger } from '../logger';
import type { Redis } from '../redis';

export const REVIEW_QUEUE = 'reviews';

export interface ReviewJobData {
  pgn: string;
  depth: number;
  key: string;
}

export interface ReviewProgress {
  done: number;
  total: number;
}

/** BullMQ forbids ":" in custom job ids. */
export const reviewId = (key: string, depth: number) => `${key}-${depth}`;

const bullPrefix = (prefix: string) => `${prefix}bull`;

export function createReviewQueue(redis: Redis, prefix: string): Queue<ReviewJobData> {
  return new Queue<ReviewJobData>(REVIEW_QUEUE, {
    // Its own connection, so closing the queue never closes the app's client.
    connection: redis.duplicate(),
    prefix: bullPrefix(prefix),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 24 * 3600 },
    },
  });
}

/** Plan ruling R4: a native binary when STOCKFISH_PATH is set, else the bundled WASM build. */
export function defaultEngineFactory(
  stockfishPath?: string,
): () => EngineAdapter & { quit(): void } {
  // Either way the engine is its own process, so a crashed or stuck one is killed and
  // replaced without touching the worker.
  return () => {
    const { command, args } = stockfishPath
      ? { command: stockfishPath, args: [] }
      : stockfishProcessCommand('lite-single');
    return new UciEngine(createProcessTransport(command, args), { readyTimeoutMs: 30_000 });
  };
}

export interface ReviewWorker {
  /** `force` drops the job in hand without finishing it (its lock then expires). */
  close(force?: boolean): Promise<void>;
}

export interface ReviewWorkerOptions {
  redis: Redis;
  prisma: PrismaClient;
  prefix: string;
  logger: Logger;
  engineFactory?: () => EngineAdapter;
  stockfishPath?: string;
  /** One engine search at a time per worker (8 GB machine, single-threaded build). */
  concurrency?: number;
  lockDuration?: number;
  stalledInterval?: number;
}

/**
 * Consumes review jobs: runs the Phase 1 pipeline on Stockfish and stores the report under
 * its (moves key, depth). A job whose worker died is moved back to the queue by BullMQ's
 * stalled-job check once its lock expires (Review Focus 4).
 */
export function startReviewWorker(opts: ReviewWorkerOptions): ReviewWorker {
  const factory = opts.engineFactory ?? defaultEngineFactory(opts.stockfishPath);
  let engine: EngineAdapter | null = null;
  let book: OpeningLookupService | null = null;

  const worker = new Worker<ReviewJobData, { key: string; depth: number }>(
    REVIEW_QUEUE,
    async (job) => {
      engine ??= factory();
      book ??= new OpeningLookupService(loadEcoBook());
      const { pgn, depth, key } = job.data;
      try {
        const report = await analyzeGame(
          { pgn },
          { engine, book },
          {
            depth,
            multiPv: 3,
            onProgress: (done, total) =>
              void job.updateProgress({ done, total } satisfies ReviewProgress),
          },
        );
        const json = JSON.parse(JSON.stringify(report));
        await opts.prisma.reviewReport.upsert({
          where: { key_depth: { key, depth } },
          create: { key, depth, report: json },
          update: { report: json },
        });
        return { key, depth };
      } catch (err) {
        // A crashed or stuck engine is replaced for the next job.
        (engine as { quit?: () => void } | null)?.quit?.();
        engine = null;
        throw err;
      }
    },
    {
      connection: opts.redis.duplicate(),
      prefix: bullPrefix(opts.prefix),
      concurrency: opts.concurrency ?? 1,
      ...(opts.lockDuration ? { lockDuration: opts.lockDuration } : {}),
      ...(opts.stalledInterval ? { stalledInterval: opts.stalledInterval } : {}),
    },
  );
  worker.on('failed', (job, err) =>
    opts.logger.error({ jobId: job?.id, err: err.message }, 'review job failed'),
  );
  worker.on('error', (err) => opts.logger.error({ err: err.message }, 'review worker error'));

  return {
    close: async (force = false) => {
      await worker.close(force);
      (engine as { quit?: () => void } | null)?.quit?.();
      engine = null;
    },
  };
}
