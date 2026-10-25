import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProfileView } from '@/components/profile/ProfileView';
import { ApiError, type Api } from '@/lib/api/client';
import { createSessionStore } from '@/lib/api/session';
import { contrastRatio } from '@/lib/design/contrast';
import { AVATAR_COLORS, avatarColor } from '@/components/profile/Avatar';

const PGN = '[White "You"]\n[Black "Pip"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
const game = (n: number, over: Partial<Record<string, unknown>> = {}) => ({
  id: `g${n}`,
  whiteName: 'You',
  blackName: 'Pip',
  botId: 'pip',
  userColor: 'white',
  pgn: PGN,
  result: '0-1',
  termination: 'checkmate',
  plies: 4,
  playedAt: '2026-10-25T10:00:00.000Z',
  ...over,
});

function profileApi(opts: { pages?: number; me?: string | null } = {}) {
  const patches: unknown[] = [];
  const api = vi.fn(async (path: string, init?: { method?: string; json?: unknown }) => {
    if (path === '/me') {
      if (!opts.me) throw new ApiError(401, 'Sign in required');
      return { user: { id: 'u1', email: 'a@x.com', username: opts.me, displayName: 'Alice' } };
    }
    if (path === '/users/alice') {
      return {
        user: {
          username: 'alice',
          displayName: 'Alice',
          country: 'IN',
          bio: 'Sicilian fan',
          avatar: 'avatar-03',
          createdAt: '2026-10-01T00:00:00.000Z',
        },
        ratings: {
          bullet: { rating: 1500, rd: 350, games: 0 },
          blitz: { rating: 1612, rd: 80, games: 30 },
          rapid: { rating: 1500, rd: 350, games: 0 },
          daily: { rating: 1500, rd: 350, games: 0 },
          puzzle: { rating: 1500, rd: 350, games: 0 },
        },
      };
    }
    if (path === '/users/alice/stats') return { total: 3, wins: 1, draws: 1, losses: 1, byBot: {} };
    if (path === '/users/alice/games?limit=20') {
      return {
        games: [game(1), game(2, { result: '1/2-1/2', termination: 'stalemate' })],
        nextCursor: opts.pages ? 'g2' : null,
      };
    }
    if (path === '/users/alice/games?limit=20&cursor=g2')
      return { games: [game(3, { result: '1-0', termination: 'resign' })], nextCursor: null };
    if (path === '/me' && init?.method === 'PATCH') return null;
    if (path.startsWith('/users/')) throw new ApiError(404, 'No such player');
    throw new Error(path);
  });
  const withPatch = vi.fn(async (path: string, init?: { method?: string; json?: unknown }) => {
    if (path === '/me' && init?.method === 'PATCH') {
      patches.push(init.json);
      return {
        user: {
          id: 'u1',
          email: 'a@x.com',
          username: 'alice',
          displayName: 'Alice W.',
          bio: 'New bio',
        },
      };
    }
    return api(path, init);
  }) as unknown as Api;
  return { api: withPatch, patches };
}

describe('<ProfileView>', () => {
  it('shows the player, their ratings, record and archive with review links', async () => {
    const { api } = profileApi({ pages: 2 });
    render(<ProfileView username="alice" api={api} session={createSessionStore(api)} />);
    expect(await screen.findByRole('heading', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByText(/@alice/)).toBeInTheDocument();
    expect(screen.getByText('Sicilian fan')).toBeInTheDocument();
    const ratings = screen.getByRole('table', { name: 'Ratings' });
    expect(within(ratings).getByRole('row', { name: /Blitz 1612 30/ })).toBeInTheDocument();
    expect(screen.getByText('1 win · 1 draw · 1 loss')).toBeInTheDocument();

    const archive = screen.getByRole('list', { name: 'Games' });
    const rows = within(archive).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(/Loss/);
    expect(rows[0]).toHaveTextContent(/checkmate/);
    expect(rows[1]).toHaveTextContent(/Draw/);
    expect(within(rows[0]!).getByRole('link', { name: /Review/ })).toHaveAttribute(
      'href',
      `/review?pgn=${encodeURIComponent(PGN)}`,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Load more games' }));
    await waitFor(() => expect(within(archive).getAllByRole('listitem')).toHaveLength(3));
    expect(within(archive).getAllByRole('listitem')[2]).toHaveTextContent(/Win/);
    expect(screen.queryByRole('button', { name: 'Load more games' })).toBeNull();
  });

  it('lets the owner edit their profile', async () => {
    const { api, patches } = profileApi({ me: 'alice' });
    const session = createSessionStore(api);
    await session.getState().load();
    render(<ProfileView username="alice" api={api} session={session} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
    const name = screen.getByLabelText('Display name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Alice W.');
    await userEvent.clear(screen.getByLabelText('Bio'));
    await userEvent.type(screen.getByLabelText('Bio'), 'New bio');
    await userEvent.click(screen.getByRole('radio', { name: 'Avatar 5' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toMatchObject({
      displayName: 'Alice W.',
      bio: 'New bio',
      avatar: 'avatar-05',
      country: 'IN',
    });
    expect(await screen.findByRole('heading', { name: 'Alice W.' })).toBeInTheDocument();
  });

  it('does not offer editing to visitors', async () => {
    const { api } = profileApi({ me: 'bob' });
    const session = createSessionStore(api);
    await session.getState().load();
    render(<ProfileView username="alice" api={api} session={session} />);
    await screen.findByRole('heading', { name: 'Alice' });
    expect(screen.queryByRole('button', { name: 'Edit profile' })).toBeNull();
  });

  it('says so for an unknown player', async () => {
    const { api } = profileApi();
    render(<ProfileView username="ghost" api={api} session={createSessionStore(api)} />);
    expect(await screen.findByText('No such player.')).toBeInTheDocument();
  });
});

describe('avatars', () => {
  it('has 12 colours, each with readable initials', () => {
    expect(AVATAR_COLORS).toHaveLength(12);
    for (let i = 1; i <= 12; i++) {
      const { bg, ink } = avatarColor(`avatar-${String(i).padStart(2, '0')}`);
      expect(contrastRatio(bg, ink)).toBeGreaterThanOrEqual(4.5);
    }
    expect(avatarColor('unknown')).toEqual(avatarColor('avatar-01'));
  });
});
