import { createHash } from 'node:crypto';
import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi } from '@/lib/api/client';
import { createSessionStore } from '@/lib/api/session';
import { browserReviewKey } from '@/lib/api/reviewKey';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('api client', () => {
  it('sends JSON same-origin under /api/v1 and parses the answer', async () => {
    const fetchFn = vi.fn(async () => json(200, { ok: 1 }));
    const api = createApi(fetchFn);
    expect(await api('/games', { method: 'POST', json: { a: 1 } })).toEqual({ ok: 1 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/games');
    expect(init.credentials).toBe('same-origin');
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('refreshes once on 401 and retries, sharing one refresh between callers', async () => {
    let refreshed = false;
    const fetchFn = vi.fn(async (url: string) => {
      if (url === '/api/v1/auth/refresh') {
        refreshed = true;
        return json(200, { user: {} });
      }
      return refreshed ? json(200, { url }) : json(401, { error: 'Sign in required' });
    });
    const api = createApi(fetchFn);
    const [a, b] = await Promise.all([api('/me'), api('/users/x')]);
    expect(a).toEqual({ url: '/api/v1/me' });
    expect(b).toEqual({ url: '/api/v1/users/x' });
    expect(fetchFn.mock.calls.filter(([u]) => u === '/api/v1/auth/refresh')).toHaveLength(1);
  });

  it('gives up after a failed refresh and reports errors with their field details', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url === '/api/v1/auth/refresh'
        ? json(401, { error: 'Session expired' })
        : url === '/api/v1/auth/signup'
          ? json(409, {
              error: 'Email already registered',
              details: { email: 'Email already registered' },
            })
          : json(401, { error: 'Sign in required' }),
    );
    const api = createApi(fetchFn);
    await expect(api('/me')).rejects.toMatchObject({ status: 401 });
    const err = (await api('/auth/signup', { method: 'POST', json: {} }).catch(
      (e) => e,
    )) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.details).toEqual({ email: 'Email already registered' });
    // Auth endpoints never trigger a refresh loop.
    expect(fetchFn.mock.calls.filter(([u]) => u === '/api/v1/auth/refresh')).toHaveLength(1);
  });

  it('treats a missing API (404 from Next, network error) as unavailable', async () => {
    const api = createApi(
      async () =>
        new Response('<html>404</html>', { status: 404, headers: { 'Content-Type': 'text/html' } }),
    );
    await expect(api('/me')).rejects.toMatchObject({ status: 404, unavailable: true });
    const down = createApi(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(down('/me')).rejects.toMatchObject({ status: 0, unavailable: true });
  });
});

describe('session store', () => {
  const user = { id: 'u1', username: 'alice', displayName: 'Alice', email: 'a@x.com' };

  it('loads the signed-in user, signs out, and signs in', async () => {
    const api = vi.fn(async (path: string) => {
      if (path === '/me') return { user };
      if (path === '/auth/logout') return undefined;
      if (path === '/auth/login') return { user };
      throw new Error(path);
    });
    const store = createSessionStore(api as never);
    expect(store.getState().status).toBe('loading');
    await store.getState().load();
    expect(store.getState()).toMatchObject({ status: 'signed-in', user });
    await store.getState().signOut();
    expect(store.getState()).toMatchObject({ status: 'signed-out', user: null });
    await store.getState().signIn('a@x.com', 'pw');
    expect(api).toHaveBeenLastCalledWith('/auth/login', {
      method: 'POST',
      json: { email: 'a@x.com', password: 'pw' },
    });
    expect(store.getState().status).toBe('signed-in');
  });

  it('is signed out on 401 and unavailable when there is no server', async () => {
    const out = createSessionStore((async () => {
      throw new ApiError(401, 'Sign in required');
    }) as never);
    await out.getState().load();
    expect(out.getState().status).toBe('signed-out');
    const none = createSessionStore((async () => {
      throw new ApiError(404, 'Not found', undefined, true);
    }) as never);
    await none.getState().load();
    expect(none.getState().status).toBe('unavailable');
  });
});

describe('browserReviewKey', () => {
  it('matches the server: sha256 of the start FEN and the SAN moves, headers ignored', async () => {
    const start = new Chess().fen();
    const expected = createHash('sha256').update(`${start}\ne4 e5 Nf3`).digest('hex');
    expect(await browserReviewKey('[Event "x"]\n\n1. e4 {!} e5 2. Nf3 *')).toBe(expected);
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const fromFen = createHash('sha256').update(`${fen}\ne4`).digest('hex');
    expect(await browserReviewKey(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. e4`)).toBe(fromFen);
  });
});
