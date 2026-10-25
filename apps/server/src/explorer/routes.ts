import {
  createProxyState,
  createRedisCache,
  handleExplorerRequest,
  type ProxyDeps,
} from '@chess/explorer-proxy';
import { Router } from 'express';
import { rateLimit } from '../http/rateLimit';
import type { ServiceDeps } from '../routes';

/**
 * GET /api/opening-explorer/:source: the Lichess explorer through a Redis cache shared by
 * every instance. The Lichess token stays on the server.
 */
export function explorerRouter(deps: ServiceDeps): Router {
  const { config, redis, redisPrefix } = deps;
  const proxy: ProxyDeps = {
    fetchFn: deps.explorerFetch ?? ((url, init) => fetch(url, init)),
    token: config.lichessToken,
    cache: createRedisCache(redis, { prefix: redisPrefix }),
    state: createProxyState(),
    now: () => deps.now().getTime(),
  };
  const router = Router();

  router.get(
    '/api/opening-explorer/:source',
    rateLimit({
      redis,
      prefix: redisPrefix,
      name: 'explorer',
      key: (req) => req.ip ?? 'unknown',
      limit: 120,
      windowSec: 60,
    }),
    async (req, res) => {
      const url = new URL(req.originalUrl, 'http://server.local');
      const answer = await handleExplorerRequest(String(req.params['source']), url, proxy);
      res.status(answer.status);
      for (const name of ['Content-Type', 'X-Cache', 'Retry-After']) {
        const value = answer.headers.get(name);
        if (value) res.setHeader(name, value);
      }
      res.send(await answer.text());
    },
  );

  return router;
}
