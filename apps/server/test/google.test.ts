import { createHash } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleDeps } from '../src/auth/google';
import { buildTestApp, cookie, testConfig, type TestApp } from './helpers/app';
import { startTestDb, type TestDb } from './helpers/db';

const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const google = { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: 'shh' };

let db: TestDb;
let privateKey: CryptoKey;
let jwks: GoogleDeps['jwks'];
const tokenCalls: URLSearchParams[] = [];
let nextIdToken: () => Promise<string>;

const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  expect(String(url)).toBe('https://oauth2.googleapis.com/token');
  tokenCalls.push(new URLSearchParams(String(init?.body)));
  return new Response(JSON.stringify({ id_token: await nextIdToken(), access_token: 'at' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as unknown as typeof fetch;

const idToken = (claims: Record<string, unknown>, opts: { exp?: string; aud?: string } = {}) =>
  new SignJWT({ email: 'gm@gmail.com', email_verified: true, name: 'Grand Master', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer('https://accounts.google.com')
    .setAudience(opts.aud ?? CLIENT_ID)
    .setSubject(String(claims['sub'] ?? 'google-sub-1'))
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m')
    .sign(privateKey);

beforeAll(async () => {
  db = await startTestDb();
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  jwks = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }],
  });
});
afterAll(() => db.stop());
beforeEach(async () => {
  await db.reset();
  tokenCalls.length = 0;
  nextIdToken = () => idToken({});
});

function app(config = testConfig(google)): TestApp {
  return buildTestApp(db.prisma, { config, extra: { google: { fetchFn, jwks } } });
}

/** Runs /start and returns the state and the oauth cookie a browser would carry back. */
async function start(t: TestApp) {
  const res = await request(t.app).get('/api/auth/google/start').expect(302);
  const location = new URL(res.headers['location'] as string);
  const oauth = cookie(res, 'chess_oauth')!;
  return {
    location,
    state: location.searchParams.get('state')!,
    oauthCookie: `chess_oauth=${encodeURIComponent(oauth.value)}`,
    oauth,
  };
}

describe('Google sign-in', () => {
  it('redirects to Google with PKCE (S256) and a state', async () => {
    const t = app();
    const { location, oauth } = await start(t);
    expect(location.origin + location.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(location.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/v1/auth/google/callback',
    );
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('scope')).toBe('openid email profile');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(oauth.attrs).toEqual(expect.arrayContaining(['httponly', 'path=/api/v1/auth/google']));
    await t.close();
  });

  it('signs a new user in, sending the PKCE verifier that matches the challenge', async () => {
    const t = app();
    const { location, state, oauthCookie } = await start(t);
    const res = await request(t.app)
      .get(`/api/auth/google/callback?code=the-code&state=${state}`)
      .set('Cookie', oauthCookie)
      .expect(302);
    expect(res.headers['location']).toBe('http://localhost:3000/');
    expect(cookie(res, 'chess_access')?.value).toBeTruthy();
    expect(cookie(res, 'chess_refresh')?.value).toBeTruthy();

    const sent = tokenCalls[0]!;
    expect(sent.get('code')).toBe('the-code');
    expect(sent.get('grant_type')).toBe('authorization_code');
    expect(sent.get('client_secret')).toBe('shh');
    const verifier = sent.get('code_verifier')!;
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
      location.searchParams.get('code_challenge'),
    );

    const user = await db.prisma.user.findUniqueOrThrow({ where: { email: 'gm@gmail.com' } });
    expect(user).toMatchObject({
      googleSub: 'google-sub-1',
      displayName: 'Grand Master',
      passwordHash: null,
    });
    // "gm" is shorter than the 3-character minimum, so it is padded.
    expect(user.username).toMatch(/^playergm(_\w+)?$/);
    expect(await db.prisma.rating.count({ where: { userId: user.id } })).toBe(5);
    await t.close();
  });

  it('reuses the account on the next sign-in, and links an existing email account', async () => {
    const t = app();
    for (let i = 0; i < 2; i++) {
      const { state, oauthCookie } = await start(t);
      await request(t.app)
        .get(`/api/auth/google/callback?code=c&state=${state}`)
        .set('Cookie', oauthCookie)
        .expect(302);
    }
    expect(await db.prisma.user.count()).toBe(1);

    await request(t.app)
      .post('/api/auth/signup')
      .send({ email: 'pw@example.com', password: 'correct horse', username: 'pwuser' })
      .expect(201);
    nextIdToken = () => idToken({ sub: 'google-sub-2', email: 'PW@example.com' });
    const { state, oauthCookie } = await start(t);
    await request(t.app)
      .get(`/api/auth/google/callback?code=c&state=${state}`)
      .set('Cookie', oauthCookie)
      .expect(302);
    const linked = await db.prisma.user.findUniqueOrThrow({ where: { email: 'pw@example.com' } });
    expect(linked.googleSub).toBe('google-sub-2');
    expect(await db.prisma.user.count()).toBe(2);
    await t.close();
  });

  it('sends the browser back to /login with a reason on failure', async () => {
    const t = app();
    const loginError = (res: { headers: Record<string, unknown> }) =>
      new URL(res.headers['location'] as string).searchParams.get('error');

    const { oauthCookie } = await start(t);
    const badState = await request(t.app)
      .get('/api/auth/google/callback?code=c&state=forged')
      .set('Cookie', oauthCookie);
    expect(badState.status).toBe(302);
    expect(loginError(badState)).toBe('google_state');
    const noCookie = await request(t.app).get('/api/auth/google/callback?code=c&state=x');
    expect(loginError(noCookie)).toBe('google_state');

    nextIdToken = () => idToken({ email_verified: false });
    const s1 = await start(t);
    const unverified = await request(t.app)
      .get(`/api/auth/google/callback?code=c&state=${s1.state}`)
      .set('Cookie', s1.oauthCookie);
    expect(loginError(unverified)).toBe('google_unverified');

    nextIdToken = () => idToken({}, { exp: '-1m' });
    const s2 = await start(t);
    const expired = await request(t.app)
      .get(`/api/auth/google/callback?code=c&state=${s2.state}`)
      .set('Cookie', s2.oauthCookie);
    expect(loginError(expired)).toBe('google_failed');

    nextIdToken = () => idToken({}, { aud: 'someone-else' });
    const s3 = await start(t);
    const wrongAud = await request(t.app)
      .get(`/api/auth/google/callback?code=c&state=${s3.state}`)
      .set('Cookie', s3.oauthCookie);
    expect(loginError(wrongAud)).toBe('google_failed');

    const denied = await request(t.app)
      .get('/api/auth/google/callback?error=access_denied&state=x')
      .set('Cookie', s3.oauthCookie);
    expect(loginError(denied)).toBe('google_cancelled');
    expect(await db.prisma.user.count()).toBe(0);
    await t.close();
  });

  it('answers 404 when Google is not configured', async () => {
    const t = app(testConfig());
    await request(t.app)
      .get('/api/auth/google/start')
      .expect(404, { error: 'Google sign-in is not configured' });
    await t.close();
  });
});
