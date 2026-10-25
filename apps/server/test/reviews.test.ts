import type { EngineAdapter } from '@chess/chess-core';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startReviewWorker, type ReviewWorker } from '../src/reviews/queue';
import { buildTestApp, cookie, type TestApp } from './helpers/app';
import { startTestDb, type TestDb } from './helpers/db';

const GAME = '[White "You"]\n[Black "Pip"]\n\n1. e4 e5 2. Nf3 Nc6 *';
const DEPTH = 8;

let db: TestDb;
let t: TestApp;
let workers: ReviewWorker[] = [];

beforeAll(async () => {
  db = await startTestDb();
  t = buildTestApp(db.prisma);
});
afterAll(async () => {
  await t.deps.reviews?.queue.close();
  await t.close();
  await db.stop();
});
beforeEach(async () => {
  await db.reset();
  await t.clearRedis();
});
afterEach(async () => {
  await Promise.all(workers.map((w) => w.close()));
  workers = [];
});

async function signedIn(username: string) {
  const res = await request(t.app)
    .post('/api/auth/signup')
    .send({ email: `${username}@example.com`, password: 'correct horse', username })
    .expect(201);
  return `chess_access=${cookie(res, 'chess_access')!.value}`;
}

const ask = (auth: string, pgn = GAME, depth = DEPTH) =>
  request(t.app).post('/api/reviews').set('Cookie', auth).send({ pgn, depth });

/** A worker on the real Stockfish WASM build (the default engine factory). */
function worker(opts: Partial<Parameters<typeof startReviewWorker>[0]> = {}) {
  const w = startReviewWorker({
    redis: t.redis,
    prisma: db.prisma,
    prefix: t.deps.redisPrefix,
    logger: t.deps.logger,
    ...opts,
  });
  workers.push(w);
  return w;
}

async function waitFor<T>(fn: () => Promise<T | null>, timeoutMs = 90_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value !== null) return value;
    if (Date.now() > deadline) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 250));
  }
}

const doneReport = (id: string) =>
  waitFor(async () => {
    const res = await request(t.app).get(`/api/reviews/${id}`);
    return res.body.status === 'done' ? res.body : null;
  });

describe('server-side Game Review', () => {
  it(
    'queues a review, the worker stores the report, and the next ask is served from cache',
    { timeout: 120_000 },
    async () => {
      const auth = await signedIn('alice');
      const queued = await ask(auth).expect(202);
      expect(queued.body).toMatchObject({ status: 'queued' });
      expect(queued.body.id).toMatch(/^[0-9a-f]{64}-8$/);

      worker();
      const done = await doneReport(queued.body.id);
      expect(done.report.moves).toHaveLength(4);
      expect(done.report.moves.map((m: { san: string }) => m.san)).toEqual([
        'e4',
        'e5',
        'Nf3',
        'Nc6',
      ]);
      expect(typeof done.report.accuracy.white).toBe('number');
      expect(await db.prisma.reviewReport.count()).toBe(1);

      // Same moves, different headers: served from the cache at once.
      const cached = await ask(auth, '[Event "Other"]\n\n1. e4 e5 2. Nf3 Nc6').expect(200);
      expect(cached.body).toMatchObject({ status: 'done', id: queued.body.id });
      expect(cached.body.report.moves).toHaveLength(4);
    },
  );

  it('runs one job when two people ask for the same game at once (Review Focus 3)', async () => {
    const [a, b] = await Promise.all([signedIn('alice'), signedIn('bob')]);
    const [ra, rb] = await Promise.all([ask(a), ask(b)]);
    expect(ra.status).toBe(202);
    expect(rb.status).toBe(202);
    expect(ra.body.id).toBe(rb.body.id);
    const counts = await t.deps.reviews!.queue.getJobCounts('waiting', 'active', 'delayed');
    expect(counts['waiting']! + counts['active']! + counts['delayed']!).toBe(1);
  });

  it(
    'recovers a job whose worker died mid-review (Review Focus 4)',
    { timeout: 120_000 },
    async () => {
      const auth = await signedIn('alice');
      const { body } = await ask(auth).expect(202);

      // A worker whose engine never answers, then dies without finishing.
      let started!: () => void;
      const began = new Promise<void>((r) => (started = r));
      const stuck: EngineAdapter = {
        analyse: () => {
          started();
          return new Promise(() => {});
        },
      };
      const doomed = worker({
        engineFactory: () => stuck,
        lockDuration: 1000,
        stalledInterval: 500,
      });
      await began;
      await doomed.close(true);
      workers = workers.filter((w) => w !== doomed);

      worker({ stalledInterval: 500, lockDuration: 30_000 });
      const done = await doneReport(body.id);
      expect(done.report.moves).toHaveLength(4);
    },
  );

  it('reports a failed job, and asking again retries it', { timeout: 120_000 }, async () => {
    const auth = await signedIn('alice');
    const { body } = await ask(auth).expect(202);
    const broken: EngineAdapter = {
      analyse: async () => Promise.reject(new Error('engine exploded')),
    };
    worker({ engineFactory: () => broken });
    const failed = await waitFor(async () => {
      const res = await request(t.app).get(`/api/reviews/${body.id}`);
      return res.body.status === 'failed' ? res.body : null;
    });
    expect(failed.error).toBe('The review could not be completed');
    expect(JSON.stringify(failed)).not.toContain('exploded');
    await Promise.all(workers.map((w) => w.close()));
    workers = [];

    const again = await ask(auth).expect(202);
    expect(again.body.status).toBe('queued');
    worker();
    await doneReport(body.id);
  });

  it('requires sign-in to ask, validates input, and 404s unknown reviews', async () => {
    await request(t.app).post('/api/reviews').send({ pgn: GAME }).expect(401);
    const auth = await signedIn('alice');
    const illegal = await ask(auth, '1. e4 e5 2. Ke3').expect(400);
    expect(illegal.body.error).toBe('Illegal move 2. Ke3');
    await ask(auth, GAME, 40).expect(400);
    await request(t.app)
      .get(`/api/reviews/${'a'.repeat(64)}-18`)
      .expect(404);
    await request(t.app).get('/api/reviews/not-an-id').expect(400);
  });

  it('limits each user to 10 review requests an hour', async () => {
    const auth = await signedIn('alice');
    for (let i = 0; i < 10; i++) await ask(auth).expect(202);
    await ask(auth).expect(429);
    const other = await signedIn('bob');
    await ask(other).expect(202);
  });
});
