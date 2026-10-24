import type { TestProject } from 'vitest/node';
import { startRedis } from './redis';

declare module 'vitest' {
  export interface ProvidedContext {
    redisUrl: string;
  }
}

/** One Redis for the whole run; each test file isolates itself with its own key prefix. */
export default async function setup(project: TestProject) {
  const redis = await startRedis();
  project.provide('redisUrl', redis.url);
  return () => redis.stop();
}
