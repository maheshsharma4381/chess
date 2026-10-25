import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, testConfig, type TestApp } from './helpers/app';
import { startTestDb, type TestDb } from './helpers/db';

const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const TOKEN = 'lip_server_secret_42';
const BODY = { white: 3, draws: 2, black: 1, moves: [], topGames: [], opening: null };

let db: TestDb;
let t: TestApp;
const calls: string[] = [];
const auths: (string | undefined)[] = [];

beforeAll(async () => {
  db = await startTestDb();
  t = buildTestApp(db.prisma, {
    config: testConfig({ LICHESS_API_TOKEN: TOKEN }),
    extra: {
      explorerFetch: async (url, init) => {
        calls.push(url);
        auths.push(init?.headers?.['Authorization']);
        return new Response(JSON.stringify(BODY), { status: 200 });
      },
    },
  });
});
afterAll(async () => {
  await t.close();
  await db.stop();
});
beforeEach(async () => {
  calls.length = 0;
  auths.length = 0;
  await t.clearRedis();
});

describe('GET /api/opening-explorer/:source', () => {
  it('proxies with the token, caches in Redis and never echoes the token', async () => {
    const path = `/api/opening-explorer/masters?fen=${encodeURIComponent(FEN)}`;
    const first = await request(t.app).get(path).expect(200);
    expect(first.headers['x-cache']).toBe('miss');
    expect(first.body).toEqual(BODY);
    const second = await request(t.app).get(path).expect(200);
    expect(second.headers['x-cache']).toBe('hit');
    expect(calls).toHaveLength(1);
    expect(auths[0]).toBe(`Bearer ${TOKEN}`);
    expect(first.text + second.text + JSON.stringify(first.headers)).not.toContain(TOKEN);
    const keys = await t.redis.keys(`${t.deps.redisPrefix}explorer:*`);
    expect(keys).toHaveLength(1);
    expect(await t.redis.ttl(keys[0]!)).toBeGreaterThan(80_000);
  });

  it('validates the query', async () => {
    await request(t.app)
      .get('/api/opening-explorer/masters?fen=nope')
      .expect(400, { error: 'Invalid fen' });
    await request(t.app)
      .get(`/api/opening-explorer/players?fen=${encodeURIComponent(FEN)}`)
      .expect(400);
    expect(calls).toHaveLength(0);
  });
});
