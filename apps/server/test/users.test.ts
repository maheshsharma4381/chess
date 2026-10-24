import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

async function signedIn(username = 'alice', email = `${username}@example.com`) {
  const res = await request(t.app)
    .post('/api/auth/signup')
    .send({ email, password: 'correct horse', username })
    .expect(201);
  return `chess_access=${cookie(res, 'chess_access')!.value}`;
}

const patch = (auth: string, body: unknown) =>
  request(t.app).patch('/api/me').set('Cookie', auth).send(body);

describe('PATCH /api/me', () => {
  it('updates the profile fields', async () => {
    const auth = await signedIn();
    const res = await patch(auth, {
      displayName: '  Alice W. ',
      country: 'in',
      bio: 'Sicilian forever',
      avatar: 'avatar-07',
    }).expect(200);
    expect(res.body.user).toMatchObject({
      displayName: 'Alice W.',
      country: 'IN',
      bio: 'Sicilian forever',
      avatar: 'avatar-07',
    });
    // Clearing optional fields with null.
    const cleared = await patch(auth, { country: null, bio: null }).expect(200);
    expect(cleared.body.user).toMatchObject({ country: null, bio: null });
  });

  it('validates each field and names it', async () => {
    const auth = await signedIn();
    const res = await patch(auth, {
      displayName: '',
      country: 'India',
      bio: 'x'.repeat(201),
      avatar: 'avatar-99',
      settings: { boardTheme: 'neon' },
    }).expect(400);
    expect(Object.keys(res.body.details).sort()).toEqual([
      'avatar',
      'bio',
      'country',
      'displayName',
      'settings.boardTheme',
    ]);
    await patch(auth, { isAdmin: true }).expect(400);
  });

  it('changes the username, refusing one that is taken', async () => {
    const auth = await signedIn('alice');
    await signedIn('bob');
    await patch(auth, { username: 'BOB' }).expect(409, {
      error: 'Username taken',
      details: { username: 'Username taken' },
    });
    const ok = await patch(auth, { username: 'Alice_2' }).expect(200);
    expect(ok.body.user.username).toBe('alice_2');
    await patch(auth, { username: 'alice_2' }).expect(200);
  });

  it('merges settings instead of replacing them', async () => {
    const auth = await signedIn();
    await patch(auth, { settings: { boardTheme: 'wood', sound: false } }).expect(200);
    const res = await patch(auth, { settings: { coachLang: 'hinglish' } }).expect(200);
    expect(res.body.user.settings).toEqual({
      boardTheme: 'wood',
      sound: false,
      coachLang: 'hinglish',
    });
  });

  it('requires sign-in', async () => {
    await request(t.app).patch('/api/me').send({ bio: 'x' }).expect(401);
  });
});

describe('GET /api/users/:username', () => {
  it('shows the public profile with ratings and without the email', async () => {
    const auth = await signedIn('alice');
    await patch(auth, { country: 'NO', bio: 'hi' }).expect(200);
    const res = await request(t.app).get('/api/users/ALICE').expect(200);
    expect(res.body.user).toMatchObject({
      username: 'alice',
      country: 'NO',
      bio: 'hi',
      avatar: 'avatar-01',
    });
    expect(res.body.ratings.blitz).toEqual({ rating: 1500, rd: 350, games: 0 });
    expect(Object.keys(res.body.ratings).sort()).toEqual([
      'blitz',
      'bullet',
      'daily',
      'puzzle',
      'rapid',
    ]);
    expect(JSON.stringify(res.body)).not.toContain('@example.com');
    await request(t.app).get('/api/users/nobody').expect(404, { error: 'No such player' });
  });
});
