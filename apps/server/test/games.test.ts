import { Chess } from 'chess.js';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { reviewKey } from '../src/reviews/key';
import { buildTestApp, cookie, type TestApp } from './helpers/app';
import { startTestDb, type TestDb } from './helpers/db';

let db: TestDb;
let t: TestApp;
beforeAll(async () => {
  db = await startTestDb();
  t = buildTestApp(db.prisma);
});
afterAll(async () => {
  await t.close();
  await db.stop();
});
beforeEach(async () => {
  await db.reset();
  await t.clearRedis();
});

async function signedIn(username = 'alice') {
  const res = await request(t.app)
    .post('/api/auth/signup')
    .send({ email: `${username}@example.com`, password: 'correct horse', username })
    .expect(201);
  return `chess_access=${cookie(res, 'chess_access')!.value}`;
}

const FOOLS_MATE = '[White "Pip"]\n[Black "You"]\n[Result "*"]\n\n1. f3 e5 2. g4 Qh4# *';
const RESIGNED = '[White "You"]\n[Black "Pip"]\n\n1. e4 e5 2. Nf3 *';

const save = (auth: string, body: Record<string, unknown>) =>
  request(t.app)
    .post('/api/games')
    .set('Cookie', auth)
    .send({ clientGameId: 'game-0001', botId: 'pip', termination: 'checkmate', ...body });

describe('reviewKey', () => {
  it('ignores headers, comments and annotation symbols', () => {
    const a = reviewKey('[Event "A"]\n\n1. e4 {best} e5!? 2. Nf3 *');
    const b = reviewKey('1.e4 e5 2.Nf3');
    expect(a.key).toBe(b.key);
    expect(a.key).toMatch(/^[0-9a-f]{64}$/);
    expect(a.sans).toEqual(['e4', 'e5', 'Nf3']);
    expect(reviewKey('1. d4').key).not.toBe(a.key);
  });

  it('includes a custom start position and rejects illegal moves with the SAN', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    expect(reviewKey(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. e4`).key).not.toBe(reviewKey('1. e4').key);
    expect(() => reviewKey('1. e4 e5 2. Ke3')).toThrow('Illegal move 2. Ke3');
  });
});

describe('POST /api/games', () => {
  it('saves a game, deriving the result from a checkmate', async () => {
    const auth = await signedIn();
    const res = await save(auth, { pgn: FOOLS_MATE, userColor: 'black' }).expect(201);
    expect(res.body.game).toMatchObject({
      whiteName: 'Pip',
      blackName: 'You',
      result: '0-1',
      termination: 'checkmate',
      plies: 4,
      rated: false,
      botId: 'pip',
      userColor: 'black',
    });
    expect(res.body.game.pgn).toContain('[Result "0-1"]');
    expect(res.body.game.pgn.trim().endsWith('Qh4# 0-1')).toBe(true);
    expect(res.body.game.reviewKey).toBe(reviewKey(FOOLS_MATE).key);
  });

  it('takes the client result for a resignation, and rejects one that contradicts the board', async () => {
    const auth = await signedIn();
    const res = await save(auth, {
      pgn: RESIGNED,
      userColor: 'white',
      termination: 'resign',
      result: '0-1',
    }).expect(201);
    expect(res.body.game.result).toBe('0-1');
    await save(auth, {
      clientGameId: 'game-0002',
      pgn: FOOLS_MATE,
      userColor: 'black',
      result: '1-0',
    }).expect(400);
  });

  it('keeps one copy when the same game is saved twice (Review Focus 5)', async () => {
    const auth = await signedIn();
    const first = await save(auth, { pgn: FOOLS_MATE, userColor: 'black' }).expect(201);
    const again = await save(auth, { pgn: FOOLS_MATE, userColor: 'black' }).expect(200);
    expect(again.body.game.id).toBe(first.body.game.id);
    expect(await db.prisma.game.count()).toBe(1);
  });

  it('rejects illegal moves, bad fields and anonymous saves', async () => {
    const auth = await signedIn();
    const bad = await save(auth, { pgn: '1. e4 e5 2. Ke3', userColor: 'white' }).expect(400);
    expect(bad.body.error).toBe('Illegal move 2. Ke3');
    const fields = await save(auth, {
      pgn: FOOLS_MATE,
      userColor: 'purple',
      clientGameId: 'x',
    }).expect(400);
    expect(Object.keys(fields.body.details).sort()).toEqual(['clientGameId', 'userColor']);
    await request(t.app).post('/api/games').send({ pgn: FOOLS_MATE }).expect(401);
  });
});

describe('archive, stats, rating history', () => {
  /** n games: alternating wins and losses against Pip, plus one draw against Maya. */
  async function seed(auth: string, n: number) {
    for (let i = 0; i < n; i++) {
      await save(auth, {
        clientGameId: `game-${String(i).padStart(4, '0')}`,
        pgn: RESIGNED,
        userColor: 'white',
        termination: 'resign',
        result: i % 2 === 0 ? '1-0' : '0-1',
      }).expect(201);
    }
    const draw = new Chess('k7/8/2K5/8/8/8/8/1Q6 w - - 0 1');
    draw.move('Qb6');
    await save(auth, {
      clientGameId: 'game-draw',
      botId: 'maya',
      pgn: draw.pgn(),
      userColor: 'white',
      termination: 'stalemate',
    }).expect(201);
  }

  it('pages through the archive newest first', async () => {
    const auth = await signedIn();
    await seed(auth, 6);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: request.Response = await request(t.app)
        .get(`/api/users/alice/games?limit=3${cursor ? `&cursor=${cursor}` : ''}`)
        .expect(200);
      seen.push(...res.body.games.map((g: { id: string }) => g.id));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(7);
    const all = await db.prisma.game.findMany({ orderBy: [{ playedAt: 'desc' }, { id: 'desc' }] });
    expect(seen).toEqual(all.map((g) => g.id));
    await request(t.app).get('/api/users/alice/games?limit=500').expect(400);
  });

  it('reads one game and 404s an unknown one', async () => {
    const auth = await signedIn();
    const saved = await save(auth, { pgn: FOOLS_MATE, userColor: 'black' }).expect(201);
    const res = await request(t.app).get(`/api/games/${saved.body.game.id}`).expect(200);
    expect(res.body.game.pgn).toContain('Qh4#');
    await request(t.app).get('/api/games/nope').expect(404);
  });

  it('counts wins, draws and losses overall and per bot', async () => {
    const auth = await signedIn();
    await seed(auth, 5);
    const res = await request(t.app).get('/api/users/alice/stats').expect(200);
    expect(res.body).toEqual({
      total: 6,
      wins: 3,
      draws: 1,
      losses: 2,
      byBot: { pip: { wins: 3, draws: 0, losses: 2 }, maya: { wins: 0, draws: 1, losses: 0 } },
    });
  });

  it('returns the rating history of a pool, starting at 1500', async () => {
    await signedIn();
    const res = await request(t.app).get('/api/users/alice/ratings/blitz').expect(200);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0]).toMatchObject({ rating: 1500, rd: 350 });
    await request(t.app).get('/api/users/alice/ratings/chess960').expect(400);
    await request(t.app).get('/api/users/ghost/ratings/blitz').expect(404);
  });
});
