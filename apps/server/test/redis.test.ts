import { afterAll, describe, expect, inject, it } from 'vitest';
import { createRedis } from '../src/redis';

describe('createRedis', () => {
  const redis = createRedis(inject('redisUrl'));
  afterAll(() => redis.quit());

  it('talks to the test Redis, including Lua scripts (BullMQ needs them)', async () => {
    expect(await redis.ping()).toBe('PONG');
    await redis.set('redis-test:k', 'v', 'EX', 10);
    expect(await redis.get('redis-test:k')).toBe('v');
    expect(await redis.eval("return redis.call('get', KEYS[1])", 1, 'redis-test:k')).toBe('v');
    expect(await redis.ttl('redis-test:k')).toBeGreaterThan(0);
  });
});
