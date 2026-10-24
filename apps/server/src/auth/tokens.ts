import { jwtVerify, SignJWT } from 'jose';

export const ACCESS_TTL_SECONDS = 15 * 60;
const ISSUER = 'chess-platform';
const AUDIENCE = 'chess-platform';

const keyOf = (secret: string) => new TextEncoder().encode(secret);

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

export function signAccess(
  claims: AccessClaims,
  secret: string,
  now = new Date(),
): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ACCESS_TTL_SECONDS)
    .sign(keyOf(secret));
}

/** The token's user and session; throws when it is forged, expired or malformed. */
export async function verifyAccess(
  token: string,
  secret: string,
  now = new Date(),
): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, keyOf(secret), {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: AUDIENCE,
    currentDate: now,
  });
  if (typeof payload.sub !== 'string' || typeof payload['sid'] !== 'string') {
    throw new Error('Token is missing its subject or session');
  }
  return { userId: payload.sub, sessionId: payload['sid'] };
}
