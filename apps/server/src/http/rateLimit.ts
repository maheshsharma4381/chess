import type { Request, RequestHandler } from 'express';
import type { Redis } from '../redis';

// INCR and set the window's expiry atomically on the first hit.
const SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {n, redis.call('TTL', KEYS[1])}`;

export interface RateLimitOptions {
  redis: Redis;
  /** Namespaces the counters (per app instance in tests). */
  prefix: string;
  name: string;
  /** The identity being limited (IP, IP + email, user id). Null skips the limit. */
  key: (req: Request) => string | null;
  limit: number;
  windowSec: number;
}

/** Fixed-window limiter shared by every server instance through Redis. */
export function rateLimit(opts: RateLimitOptions): RequestHandler {
  return async (req, res, next) => {
    const id = opts.key(req);
    if (id === null) return next();
    const [count, ttl] = (await opts.redis.eval(
      SCRIPT,
      1,
      `${opts.prefix}rl:${opts.name}:${id}`,
      String(opts.windowSec),
    )) as [number, number];
    res.setHeader('RateLimit-Limit', String(opts.limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, opts.limit - count)));
    if (count > opts.limit) {
      res.setHeader('Retry-After', String(Math.max(1, ttl)));
      res.status(429).json({ error: 'Too many requests. Try again later.' });
      return;
    }
    next();
  };
}
