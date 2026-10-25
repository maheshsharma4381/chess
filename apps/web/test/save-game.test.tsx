import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import { BotGame } from '@/components/play/BotGame';
import type { Api } from '@/lib/api/client';
import { createSessionStore } from '@/lib/api/session';
import type { BotEngine } from '@/lib/game/botGameStore';

const engine: BotEngine = {
  async bestMove(fen) {
    const uci = new Chess(fen).moves({ verbose: true }).find((m) => m.san === 'e5')?.lan ?? 'a7a6';
    return { bestmove: uci, lines: [{ uci, pv: [uci], score: { cp: 0 }, depth: 8 }] };
  },
  async analyse() {
    return [{ uci: 'g1f3', pv: ['g1f3'], score: { cp: 20 }, depth: 8 }];
  },
};
const alice = { id: 'u1', email: 'a@x.com', username: 'alice', displayName: 'Alice' };
const square = (name: string) =>
  within(screen.getByRole('grid', { name: /chess board/i })).getByRole('button', {
    name: new RegExp(`^${name},`),
  });

function signedInApi() {
  const saves: Array<Record<string, unknown>> = [];
  const api = vi.fn(async (path: string, init?: { json?: unknown }) => {
    if (path === '/me') return { user: alice };
    if (path === '/games') {
      saves.push(init!.json as Record<string, unknown>);
      return { game: { id: `g${saves.length}` } };
    }
    throw new Error(`unexpected ${path}`);
  }) as unknown as Api;
  return { api, saves };
}

async function playAndResign() {
  await userEvent.click(square('e2'));
  await userEvent.click(square('e4'));
  await waitFor(() => expect(screen.getByRole('button', { name: /^e5$/ })).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /resign/i }));
}

describe('saving finished bot games', () => {
  it('saves once when a signed-in player finishes, and links to the archive', async () => {
    const { api, saves } = signedInApi();
    const session = createSessionStore(api);
    await session.getState().load();
    const { rerender } = render(
      <BotGame
        botId="maya"
        mode="friendly"
        color="w"
        engine={engine}
        api={api}
        session={session}
      />,
    );
    await playAndResign();
    expect(await screen.findByRole('link', { name: 'Saved to your archive' })).toHaveAttribute(
      'href',
      '/profile/alice',
    );
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({
      botId: 'maya',
      userColor: 'white',
      termination: 'resign',
      result: '0-1',
    });
    expect(String(saves[0]!['pgn'])).toMatch(/1\. e4 e5/);
    expect(String(saves[0]!['clientGameId'])).toMatch(/^[\w-]{8,64}$/);

    rerender(
      <BotGame
        botId="maya"
        mode="friendly"
        color="w"
        engine={engine}
        api={api}
        session={session}
      />,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(saves).toHaveLength(1);

    // A new game gets a new id.
    await userEvent.click(screen.getByRole('button', { name: /new game/i }));
    await playAndResign();
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(saves[1]!['clientGameId']).not.toBe(saves[0]!['clientGameId']);
  });

  it('invites a signed-out player to log in to keep their games', async () => {
    const api = vi.fn(async () => {
      const { ApiError } = await import('@/lib/api/client');
      throw new ApiError(401, 'Sign in required');
    }) as unknown as Api;
    const session = createSessionStore(api);
    await session.getState().load();
    render(
      <BotGame
        botId="maya"
        mode="friendly"
        color="w"
        engine={engine}
        api={api}
        session={session}
      />,
    );
    await playAndResign();
    expect(await screen.findByRole('link', { name: 'Log in to save your games' })).toHaveAttribute(
      'href',
      '/login?next=/play/bots',
    );
  });

  it('offers a retry when saving fails', async () => {
    let fail = true;
    const api = vi.fn(async (path: string) => {
      if (path === '/me') return { user: alice };
      if (fail) {
        const { ApiError } = await import('@/lib/api/client');
        throw new ApiError(503, 'Service unavailable');
      }
      return { game: { id: 'g1' } };
    }) as unknown as Api;
    const session = createSessionStore(api);
    await session.getState().load();
    render(
      <BotGame
        botId="maya"
        mode="friendly"
        color="w"
        engine={engine}
        api={api}
        session={session}
      />,
    );
    await playAndResign();
    expect(await screen.findByText(/could not save/i)).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    expect(await screen.findByRole('link', { name: 'Saved to your archive' })).toBeInTheDocument();
  });
});
