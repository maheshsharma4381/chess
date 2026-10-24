import { Router, type RequestHandler } from 'express';
import type { ServiceDeps } from '../routes';
import { selfView } from './view';

export function usersRouter(deps: ServiceDeps, auth: { requireAuth: RequestHandler }): Router {
  const { prisma } = deps;
  const router = Router();

  router.get('/api/me', auth.requireAuth, async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    res.json({ user: selfView(user) });
  });

  return router;
}
