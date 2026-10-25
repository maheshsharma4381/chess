import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { HttpError, parseBody } from '../http/errors';
import { rateLimit } from '../http/rateLimit';
import type { ServiceDeps } from '../routes';
import { reviewKey } from './key';
import { reviewId, type ReviewProgress } from './queue';

const askBody = z
  .object({
    pgn: z.string().min(1).max(100_000),
    // 14 = the browser's quick review, 18 = the spec's deep review; 8+ for fast checks.
    depth: z.number().int().min(8).max(20).default(18),
  })
  .strict();
const ID = /^([0-9a-f]{64})-(\d{1,2})$/;

const progressOf = (value: unknown): ReviewProgress | null =>
  typeof value === 'object' && value !== null && 'done' in value && 'total' in value
    ? (value as ReviewProgress)
    : null;

export function reviewsRouter(deps: ServiceDeps, auth: { requireAuth: RequestHandler }): Router {
  const { prisma, redis, redisPrefix } = deps;
  const queue = deps.reviews!.queue;
  const router = Router();

  router.post(
    '/api/reviews',
    auth.requireAuth,
    // Plan ruling R8: reviews cost CPU, so each account gets 10 an hour.
    rateLimit({
      redis,
      prefix: redisPrefix,
      name: 'review',
      key: (req) => req.user?.id ?? null,
      limit: 10,
      windowSec: 3600,
    }),
    async (req, res) => {
      const body = parseBody(askBody, req.body);
      const { key } = reviewKey(body.pgn);
      const id = reviewId(key, body.depth);
      const cached = await prisma.reviewReport.findUnique({
        where: { key_depth: { key, depth: body.depth } },
      });
      if (cached) {
        res.json({ status: 'done', id, report: cached.report });
        return;
      }
      // The job id is the cache key, so the same game asked twice is one job (Review Focus 3).
      let job = await queue.getJob(id);
      if (job && (await job.getState()) === 'failed') await job.retry('failed');
      if (!job || (await job.getState()) === 'completed') {
        if (job) await job.remove();
        job = await queue.add('review', { pgn: body.pgn, depth: body.depth, key }, { jobId: id });
      }
      const state = await job.getState();
      res.status(202).json({
        status: state === 'active' ? 'active' : 'queued',
        id,
        progress: progressOf(job.progress),
      });
    },
  );

  router.get('/api/reviews/:id', async (req, res) => {
    const match = ID.exec(req.params['id'] ?? '');
    if (!match) throw new HttpError(400, 'Invalid review id');
    const [, key, depth] = match as unknown as [string, string, string];
    const id = reviewId(key, Number(depth));
    const cached = await prisma.reviewReport.findUnique({
      where: { key_depth: { key, depth: Number(depth) } },
    });
    if (cached) {
      res.json({ status: 'done', id, report: cached.report });
      return;
    }
    const job = await queue.getJob(id);
    if (!job) throw new HttpError(404, 'No such review');
    const state = await job.getState();
    if (state === 'failed') {
      // The cause is logged by the worker; clients get a stable message.
      res.json({ status: 'failed', id, error: 'The review could not be completed' });
      return;
    }
    res.json({
      status: state === 'active' ? 'active' : 'queued',
      id,
      progress: progressOf(job.progress),
    });
  });

  return router;
}
