import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password';
import { signAccess, verifyAccess } from '../src/auth/tokens';
import { buildTestApp, cookie, fakeClock, TEST_SECRET, type TestApp } from './helpers/app';
import { startTestDb, type TestDb } from './helpers/db';

let db: TestDb;
let t: TestApp;
const clock = fakeClock();
beforeAll(async () => {
  db = await startTestDb();
  t = buildTestApp(db.prisma, { now: clock.now });
});
afterAll(async () => {
  await t.close();
  await db.stop();
});
beforeEach(async () => {
  await db.reset();
  await t.clearRedis();
});

const signup = (body: Record<string, unknown> = {}) =>
  request(t.app)
    .post('/api/auth/signup')
    .send({ email: 'me@example.com', password: 'correct horse', username: 'Magnus_1', ...body });

describe('passwords', () => {
  it('hashes with scrypt and verifies', async () => {
    const stored = await hashPassword('correct horse');
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('wrong horse', stored)).toBe(false);
    expect(await hashPassword('correct horse')).not.toBe(stored);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
});

describe('access tokens', () => {
  it('carry the user and session and expire after 15 minutes', async () => {
    const now = new Date('2026-10-25T12:00:00Z');
    const token = await signAccess({ userId: 'u1', sessionId: 's1' }, TEST_SECRET, now);
    expect(await verifyAccess(token, TEST_SECRET, new Date(now.getTime() + 14 * 60_000))).toEqual({
      userId: 'u1',
      sessionId: 's1',
    });
    await expect(
      verifyAccess(token, TEST_SECRET, new Date(now.getTime() + 16 * 60_000)),
    ).rejects.toThrow();
    await expect(
      verifyAccess(token, 'another-secret-that-is-32-characters-long!', now),
    ).rejects.toThrow();
  });
});

describe('sign up', () => {
  it('creates the account, five pools at 1500 and sets both cookies', async () => {
    const res = await signup().expect(201);
    expect(res.body.user).toMatchObject({
      email: 'me@example.com',
      username: 'magnus_1',
      displayName: 'Magnus_1',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt/);
    expect(res.body.accessToken).toBeUndefined();

    const access = cookie(res, 'chess_access')!;
    expect(access.attrs).toEqual(expect.arrayContaining(['httponly', 'path=/', 'samesite=lax']));
    const refresh = cookie(res, 'chess_refresh')!;
    expect(refresh.attrs).toEqual(
      expect.arrayContaining(['httponly', 'path=/api/auth', 'samesite=lax']),
    );
    expect(access.attrs).not.toContain('secure');

    const ratings = await db.prisma.rating.findMany({ orderBy: { pool: 'asc' } });
    expect(ratings.map((r) => [r.pool, r.rating, r.rd, r.volatility])).toEqual([
      ['bullet', 1500, 350, 0.06],
      ['blitz', 1500, 350, 0.06],
      ['rapid', 1500, 350, 0.06],
      ['daily', 1500, 350, 0.06],
      ['puzzle', 1500, 350, 0.06],
    ]);
    expect(await db.prisma.ratingEvent.count()).toBe(5);
  });

  it('rejects a duplicate email in any case or spacing with 409 (Review Focus 2)', async () => {
    await signup().expect(201);
    const res = await signup({ email: '  ME@Example.COM ', username: 'other' }).expect(409);
    expect(res.body).toEqual({
      error: 'Email already registered',
      details: { email: 'Email already registered' },
    });
  });

  it('rejects a taken username (any case) and bad input per field', async () => {
    await signup().expect(201);
    await signup({ email: 'b@example.com', username: 'MAGNUS_1' }).expect(409);
    const bad = await signup({ email: 'nope', password: 'short', username: 'a b' }).expect(400);
    expect(Object.keys(bad.body.details).sort()).toEqual(['email', 'password', 'username']);
  });

  it('returns tokens in the body for token-mode (mobile) clients', async () => {
    const res = await signup().set('X-Auth-Mode', 'token').expect(201);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
  });
});

describe('log in, me, refresh, log out', () => {
  it('logs in, then /api/me works by cookie and by Bearer token', async () => {
    await signup().expect(201);
    const login = await request(t.app)
      .post('/api/auth/login')
      .send({ email: 'Me@Example.com', password: 'correct horse' })
      .expect(200);
    const access = cookie(login, 'chess_access')!.value;
    await request(t.app).get('/api/me').set('Cookie', `chess_access=${access}`).expect(200);
    const me = await request(t.app)
      .get('/api/me')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    expect(me.body.user.username).toBe('magnus_1');
    await request(t.app).get('/api/me').expect(401, { error: 'Sign in required' });
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    await signup().expect(201);
    const wrong = await request(t.app)
      .post('/api/auth/login')
      .send({ email: 'me@example.com', password: 'nope nope' });
    const unknown = await request(t.app)
      .post('/api/auth/login')
      .send({ email: 'x@example.com', password: 'nope nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('rotates the refresh token', async () => {
    const res = await signup().expect(201);
    const r1 = cookie(res, 'chess_refresh')!.value;
    const refreshed = await request(t.app)
      .post('/api/auth/refresh')
      .set('Cookie', `chess_refresh=${r1}`)
      .expect(200);
    const r2 = cookie(refreshed, 'chess_refresh')!.value;
    expect(r2).not.toBe(r1);
    expect(cookie(refreshed, 'chess_access')!.value).toBeTruthy();
    await request(t.app)
      .post('/api/auth/refresh')
      .send({ refreshToken: r2 })
      .set('X-Auth-Mode', 'token')
      .expect(200);
  });

  it('lets one of two simultaneous refreshes win without revoking the session (Review Focus 1)', async () => {
    const res = await signup().expect(201);
    const r1 = cookie(res, 'chess_refresh')!.value;
    const [a, b] = await Promise.all([
      request(t.app).post('/api/auth/refresh').set('Cookie', `chess_refresh=${r1}`),
      request(t.app).post('/api/auth/refresh').set('Cookie', `chess_refresh=${r1}`),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
    const winner = a.status === 200 ? a : b;
    const next = cookie(winner, 'chess_refresh')!.value;
    await request(t.app)
      .post('/api/auth/refresh')
      .set('Cookie', `chess_refresh=${next}`)
      .expect(200);
  });

  it('revokes the whole family when an old refresh token is replayed later', async () => {
    const res = await signup().expect(201);
    const r1 = cookie(res, 'chess_refresh')!.value;
    const refreshed = await request(t.app)
      .post('/api/auth/refresh')
      .set('Cookie', `chess_refresh=${r1}`)
      .expect(200);
    const r2 = cookie(refreshed, 'chess_refresh')!.value;
    const access2 = cookie(refreshed, 'chess_access')!.value;
    clock.advance(11_000);
    await request(t.app).post('/api/auth/refresh').set('Cookie', `chess_refresh=${r1}`).expect(401);
    // The thief's replay killed the family: the legitimate newer token and access token die too.
    await request(t.app).post('/api/auth/refresh').set('Cookie', `chess_refresh=${r2}`).expect(401);
    await request(t.app).get('/api/me').set('Authorization', `Bearer ${access2}`).expect(401);
  });

  it('logs out: the session and its access token stop working', async () => {
    const res = await signup().expect(201);
    const access = cookie(res, 'chess_access')!.value;
    const refresh = cookie(res, 'chess_refresh')!.value;
    const out = await request(t.app)
      .post('/api/auth/logout')
      .set('Cookie', `chess_access=${access}; chess_refresh=${refresh}`)
      .expect(204);
    expect(cookie(out, 'chess_access')!.value).toBe('');
    await request(t.app).get('/api/me').set('Authorization', `Bearer ${access}`).expect(401);
    await request(t.app)
      .post('/api/auth/refresh')
      .set('Cookie', `chess_refresh=${refresh}`)
      .expect(401);
  });

  it('expires refresh tokens after 30 days', async () => {
    const res = await signup().expect(201);
    const r1 = cookie(res, 'chess_refresh')!.value;
    clock.advance(31 * 24 * 3600_000);
    await request(t.app).post('/api/auth/refresh').set('Cookie', `chess_refresh=${r1}`).expect(401);
  });
});

describe('rate limits', () => {
  it('allows 10 login attempts per 15 minutes per IP and email', async () => {
    await signup().expect(201);
    for (let i = 0; i < 10; i++) {
      await request(t.app)
        .post('/api/auth/login')
        .send({ email: 'me@example.com', password: 'wrong pass' })
        .expect(401);
    }
    const blocked = await request(t.app)
      .post('/api/auth/login')
      .send({ email: 'me@example.com', password: 'correct horse' })
      .expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // Another email from the same IP is unaffected.
    await request(t.app)
      .post('/api/auth/login')
      .send({ email: 'x@example.com', password: 'wrong pass' })
      .expect(401);
  });
});
