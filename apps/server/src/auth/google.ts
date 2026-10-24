import { createHash, randomBytes } from 'node:crypto';
import { Router, type Response } from 'express';
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from 'jose';
import { HttpError } from '../http/errors';
import type { ServiceDeps } from '../routes';
import { issueAuth } from './middleware';
import { createUser } from './routes';
import { createSession } from './sessions';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const OAUTH_COOKIE = 'chess_oauth';
const OAUTH_TTL_SECONDS = 10 * 60;

export interface GoogleDeps {
  fetchFn: typeof fetch;
  /** Google's signing keys (remote JWKS in production, a local set in tests). */
  jwks: JWTVerifyGetKey;
}

let remoteJwks: JWTVerifyGetKey | null = null;
const defaultGoogle = (): GoogleDeps => ({
  fetchFn: fetch,
  jwks: (remoteJwks ??= createRemoteJWKSet(new URL(JWKS_URL))),
});

const b64url = (buf: Buffer) => buf.toString('base64url');

/** A free username from the email's local part ("gm", then "gm_3fa1", ...). */
function usernameCandidates(email: string): string[] {
  let base = (email.split('@')[0] ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 15);
  if (base.length < 3) base = `player${base}`.slice(0, 15);
  return [base, ...Array.from({ length: 5 }, () => `${base}_${randomBytes(2).toString('hex')}`)];
}

/**
 * Google sign-in (plan ruling R5): authorization code + PKCE + state, the id_token verified
 * against Google's keys. Users land back on the web app; failures go to /login?error=….
 */
export function googleRouter(deps: ServiceDeps): Router {
  const { config, prisma, logger, now } = deps;
  const google = deps.google ?? defaultGoogle();
  const key = new TextEncoder().encode(config.authSecret);
  const cookiePath = `${config.publicApiPrefix}/auth/google`;
  const router = Router();

  const fail = (res: Response, reason: string) => {
    res.clearCookie(OAUTH_COOKIE, { path: cookiePath });
    res.redirect(302, `${config.webOrigin}/login?error=${reason}`);
  };

  router.get('/api/auth/google/start', async (_req, res) => {
    const g = config.google;
    if (!g) throw new HttpError(404, 'Google sign-in is not configured');
    const state = b64url(randomBytes(16));
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash('sha256').update(verifier).digest());
    const sealed = await new SignJWT({ state, verifier })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('google-oauth')
      .setIssuedAt()
      .setExpirationTime(`${OAUTH_TTL_SECONDS}s`)
      .sign(key);
    // Lax still sends the cookie on Google's top-level redirect back to us.
    res.cookie(OAUTH_COOKIE, sealed, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.production,
      path: cookiePath,
      maxAge: OAUTH_TTL_SECONDS * 1000,
    });
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      client_id: g.clientId,
      redirect_uri: g.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    res.redirect(302, url.toString());
  });

  router.get('/api/auth/google/callback', async (req, res) => {
    const g = config.google;
    if (!g) throw new HttpError(404, 'Google sign-in is not configured');
    if (typeof req.query['error'] === 'string') return fail(res, 'google_cancelled');

    const sealed = (req.cookies as Record<string, string> | undefined)?.[OAUTH_COOKIE];
    const state = req.query['state'];
    const code = req.query['code'];
    let saved: { state: string; verifier: string };
    try {
      if (!sealed) throw new Error('no oauth cookie');
      const { payload } = await jwtVerify(sealed, key, {
        audience: 'google-oauth',
        currentDate: now(),
      });
      saved = payload as unknown as { state: string; verifier: string };
    } catch {
      return fail(res, 'google_state');
    }
    if (typeof state !== 'string' || state !== saved.state || typeof code !== 'string') {
      return fail(res, 'google_state');
    }

    let claims: { sub: string; email: string; email_verified: boolean; name?: string };
    try {
      const tokenRes = await google.fetchFn(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: g.clientId,
          client_secret: g.clientSecret,
          redirect_uri: g.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: saved.verifier,
        }).toString(),
      });
      if (!tokenRes.ok) throw new Error(`token endpoint answered ${tokenRes.status}`);
      const body = (await tokenRes.json()) as { id_token?: string };
      if (!body.id_token) throw new Error('no id_token');
      const { payload } = await jwtVerify(body.id_token, google.jwks, {
        issuer: ISSUERS,
        audience: g.clientId,
        currentDate: now(),
      });
      if (typeof payload.sub !== 'string' || typeof payload['email'] !== 'string') {
        throw new Error('id_token lacks sub or email');
      }
      claims = {
        sub: payload.sub,
        email: payload['email'].trim().toLowerCase(),
        email_verified: payload['email_verified'] === true,
        name: typeof payload['name'] === 'string' ? payload['name'] : undefined,
      };
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'google sign-in failed');
      return fail(res, 'google_failed');
    }
    // An unverified address could belong to someone else: never sign in or link on it.
    if (!claims.email_verified) return fail(res, 'google_unverified');

    let user = await prisma.user.findUnique({ where: { googleSub: claims.sub } });
    if (!user) {
      const byEmail = await prisma.user.findUnique({ where: { email: claims.email } });
      if (byEmail) {
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: { googleSub: claims.sub },
        });
      }
    }
    if (!user) {
      for (const username of usernameCandidates(claims.email)) {
        try {
          user = await createUser(prisma, {
            email: claims.email,
            username,
            displayName: (claims.name ?? username).slice(0, 40),
            googleSub: claims.sub,
          });
          break;
        } catch (err) {
          if (!(err instanceof HttpError && err.details?.['username'])) throw err;
        }
      }
      if (!user) return fail(res, 'google_failed');
    }

    const issued = await createSession(prisma, user.id, {
      now: now(),
      userAgent: req.get('user-agent'),
    });
    res.clearCookie(OAUTH_COOKIE, { path: cookiePath });
    await issueAuth(
      res,
      req,
      config,
      { userId: user.id, sessionId: issued.session.id, refreshToken: issued.refreshToken },
      now(),
    );
    res.redirect(302, `${config.webOrigin}/`);
  });

  return router;
}
