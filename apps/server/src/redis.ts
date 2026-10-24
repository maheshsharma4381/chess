import { Redis } from 'ioredis';

export type { Redis };

/**
 * A Redis client. `maxRetriesPerRequest: null` is what BullMQ workers require (blocking
 * commands must wait out a reconnect instead of failing).
 */
export function createRedis(url: string, opts: { lazyConnect?: boolean } = {}): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: opts.lazyConnect ?? false });
}
