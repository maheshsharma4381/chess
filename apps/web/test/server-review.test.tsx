import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import { analyzeGame, type EngineAdapter } from '@chess/chess-core';
import { OpeningLookupService, loadEcoBook } from '@chess/chess-core/book';
import type { ReviewReport } from '@chess/types';
import { GameReview } from '@/components/review/GameReview';
import { ApiError, type Api } from '@/lib/api/client';
import { browserReviewKey } from '@/lib/api/reviewKey';
import { createSessionStore } from '@/lib/api/session';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const PGN = '[White "You"]\n[Black "Pip"]\n\n1. e4 e5 2. Nf3 Nc6 *';
const engine: EngineAdapter = {
  async analyse(fen, opts) {
    const m = new Chess(fen).moves({ verbose: true })[0]!;
    return [{ uci: m.lan, pv: [m.lan], score: { cp: 10 }, depth: opts.depth }];
  },
};
const alice = { id: 'u1', email: 'a@x.com', username: 'alice', displayName: 'Alice' };

let fixture: ReviewReport | null = null;
async function serverReport() {
  fixture ??= await analyzeGame(
    { pgn: PGN },
    { engine, book: new OpeningLookupService(loadEcoBook()) },
    { depth: 18, multiPv: 3 },
  );
  return fixture;
}

async function signedIn(
  routes: (path: string, init?: { method?: string; json?: unknown }) => unknown,
) {
  const calls: Array<[string, unknown]> = [];
  const api = vi.fn(async (path: string, init?: { method?: string; json?: unknown }) => {
    calls.push([path, init?.json]);
    if (path === '/me') return { user: alice };
    return routes(path, init);
  }) as unknown as Api;
  const session = createSessionStore(api);
  await session.getState().load();
  return { api, session, calls };
}

const summary = () => screen.findByRole('region', { name: /review summary/i }, { timeout: 30_000 });

describe('server-side Game Review in the browser', () => {
  it('loads a cached server report at once', async () => {
    const key = await browserReviewKey(PGN);
    const report = await serverReport();
    const { api, session, calls } = await signedIn((path) => {
      if (path === `/reviews/${key}-18`) return { status: 'done', id: `${key}-18`, report };
      throw new ApiError(404, 'No such review');
    });
    render(<GameReview pgn={PGN} engine={engine} api={api} session={session} pollMs={10} />);
    await summary();
    expect(await screen.findByText(/server review at depth 18/i)).toBeInTheDocument();
    expect(calls.some(([p]) => p === '/reviews')).toBe(false);
  });

  it('runs Deeper review as a server job and swaps in its report', async () => {
    const key = await browserReviewKey(PGN);
    const report = await serverReport();
    let polls = 0;
    const { api, session, calls } = await signedIn((path, init) => {
      if (path === '/reviews' && init?.method === 'POST')
        return { status: 'queued', id: `${key}-18`, progress: null };
      if (path === `/reviews/${key}-18`) {
        polls++;
        if (polls === 1) throw new ApiError(404, 'No such review'); // the mount-time cache check
        if (polls === 2)
          return { status: 'active', id: `${key}-18`, progress: { done: 2, total: 5 } };
        return { status: 'done', id: `${key}-18`, report };
      }
      throw new Error(path);
    });
    render(<GameReview pgn={PGN} engine={engine} api={api} session={session} pollMs={10} />);
    await summary();
    expect(screen.getByText(/in your browser at depth 14/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /deeper review/i }));
    expect(await screen.findByText(/server review at depth 18/i)).toBeInTheDocument();
    expect(calls.find(([p]) => p === '/reviews')?.[1]).toEqual({ pgn: PGN, depth: 18 });
  });

  it('falls back to the browser when the server review fails', async () => {
    const key = await browserReviewKey(PGN);
    const { api, session } = await signedIn((path, init) => {
      if (path === '/reviews' && init?.method === 'POST')
        return { status: 'queued', id: `${key}-18`, progress: null };
      if (path === `/reviews/${key}-18`) {
        // First the cache check (missing), then the job fails.
        return init?.method ? null : failedOnce();
      }
      throw new Error(path);
    });
    let seen = 0;
    function failedOnce() {
      seen++;
      if (seen === 1) throw new ApiError(404, 'No such review');
      return { status: 'failed', id: `${key}-18`, error: 'The review could not be completed' };
    }
    render(<GameReview pgn={PGN} engine={engine} api={api} session={session} pollMs={10} />);
    await summary();
    await userEvent.click(screen.getByRole('button', { name: /deeper review/i }));
    expect(await screen.findByText(/could not be completed/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /review deeper in your browser/i }));
    await waitFor(
      () => expect(screen.getByText(/in your browser at depth 18/i)).toBeInTheDocument(),
      {
        timeout: 30_000,
      },
    );
  });

  it('reviews deeper in the browser when signed out', async () => {
    const api = vi.fn(async () => {
      throw new ApiError(401, 'Sign in required');
    }) as unknown as Api;
    const session = createSessionStore(api);
    await session.getState().load();
    render(<GameReview pgn={PGN} engine={engine} api={api} session={session} pollMs={10} />);
    await summary();
    await userEvent.click(screen.getByRole('button', { name: /deeper review/i }));
    await waitFor(
      () => expect(screen.getByText(/in your browser at depth 18/i)).toBeInTheDocument(),
      {
        timeout: 30_000,
      },
    );
    expect(api).not.toHaveBeenCalledWith('/reviews', expect.anything());
  });
});
