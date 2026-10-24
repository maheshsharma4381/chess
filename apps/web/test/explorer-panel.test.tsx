import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import { OpeningExplorerService } from '@chess/chess-core';
import { ExplorerPanel, RESULT_BAR, compactCount } from '@/components/explorer/ExplorerPanel';
import { contrastRatio } from '@/lib/design/contrast';

const AFTER_E4 = (() => {
  const c = new Chess();
  c.move('e4');
  return c.fen();
})();
const AFTER_D4 = (() => {
  const c = new Chess();
  c.move('d4');
  return c.fen();
})();

const raw = (moves: { uci: string; san: string; w: number; d: number; b: number }[]) => ({
  white: moves.reduce((s, m) => s + m.w, 0),
  draws: moves.reduce((s, m) => s + m.d, 0),
  black: moves.reduce((s, m) => s + m.b, 0),
  opening: { eco: 'B00', name: "King's Pawn Game" },
  moves: moves.map((m) => ({
    uci: m.uci,
    san: m.san,
    white: m.w,
    draws: m.d,
    black: m.b,
    averageRating: 2400,
  })),
  topGames: [
    {
      id: 'abc123',
      uci: 'c7c5',
      winner: 'black',
      white: { name: 'Carlsen, M.', rating: 2850 },
      black: { name: 'Caruana, F.', rating: 2800 },
      year: 2019,
    },
  ],
});

// c5: 300k games, 30/40/30. e6: 1000 games, Black wins 50% (best for Black => Top Counter).
const E4_BODY = raw([
  { uci: 'c7c5', san: 'c5', w: 90_000, d: 120_000, b: 90_000 },
  { uci: 'e7e5', san: 'e5', w: 80_000, d: 90_000, b: 70_000 },
  { uci: 'e7e6', san: 'e6', w: 200, d: 300, b: 500 },
]);
const D4_BODY = raw([{ uci: 'g8f6', san: 'Nf6', w: 40, d: 40, b: 20 }]);

type Reply = { status: number; body?: unknown };
const respond = ({ status, body }: Reply) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });

function setup(replies: (url: string) => Reply | Promise<Reply>) {
  const fetchFn = vi.fn((url: string) => Promise.resolve(replies(url)).then(respond));
  const service = new OpeningExplorerService({ baseUrl: '/api/opening-explorer', fetchFn });
  return { fetchFn, service };
}

const rows = () => within(screen.getByRole('list', { name: 'Moves' })).getAllByRole('button');

describe('compactCount', () => {
  it('abbreviates large game counts', () => {
    expect(compactCount(950)).toBe('950');
    expect(compactCount(12_340)).toBe('12.3K');
    expect(compactCount(1_234_567)).toBe('1.2M');
  });
});

describe('<ExplorerPanel>', () => {
  it('lists the moves with W/D/B bars sized to the percentages', async () => {
    const { service } = setup(() => ({ status: 200, body: E4_BODY }));
    render(<ExplorerPanel fen={AFTER_E4} onPlayMove={() => {}} service={service} />);

    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(screen.getByText("King's Pawn Game")).toBeInTheDocument();
    const c5 = rows()[0]!;
    expect(c5).toHaveAccessibleName(/^c5, 300K games, White 30%, draw 40%, Black 30%/);
    expect(within(c5).getByTestId('bar-white')).toHaveStyle({ width: '30%' });
    expect(within(c5).getByTestId('bar-draw')).toHaveStyle({ width: '40%' });
    expect(within(c5).getByTestId('bar-black')).toHaveStyle({ width: '30%' });
    expect(within(c5).getByText('2400')).toBeInTheDocument();
  });

  it('shows the Main Line and Top Counter badges', async () => {
    const { service } = setup(() => ({ status: 200, body: E4_BODY }));
    render(<ExplorerPanel fen={AFTER_E4} onPlayMove={() => {}} service={service} />);

    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(within(rows()[0]!).getByText('Main Line')).toBeInTheDocument();
    expect(within(rows()[2]!).getByText('Top Counter')).toBeInTheDocument();
    expect(within(rows()[1]!).queryByText(/Main Line|Top Counter/)).toBeNull();
  });

  it('plays the clicked move', async () => {
    const onPlayMove = vi.fn();
    const { service } = setup(() => ({ status: 200, body: E4_BODY }));
    render(<ExplorerPanel fen={AFTER_E4} onPlayMove={onPlayMove} service={service} />);

    await waitFor(() => expect(rows()).toHaveLength(3));
    await userEvent.click(rows()[1]!);
    expect(onPlayMove).toHaveBeenCalledWith('e7e5');
  });

  it('lists top games with players, result and year', async () => {
    const { service } = setup(() => ({ status: 200, body: E4_BODY }));
    render(<ExplorerPanel fen={AFTER_E4} onPlayMove={() => {}} service={service} />);

    const games = await screen.findByRole('list', { name: 'Top games' });
    const link = within(games).getByRole('link');
    expect(link).toHaveAttribute('href', 'https://lichess.org/abc123');
    expect(link).toHaveTextContent(/Carlsen, M\..*2850.*Caruana, F\..*2800/);
    expect(link).toHaveTextContent('0-1');
    expect(link).toHaveTextContent('2019');
    expect(link).toHaveTextContent('c5');
  });

  it('sends the rating and speed filters for the Lichess database only', async () => {
    const { fetchFn, service } = setup(() => ({ status: 200, body: E4_BODY }));
    render(<ExplorerPanel fen={AFTER_E4} onPlayMove={() => {}} service={service} />);

    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    expect(fetchFn.mock.calls[0]![0]).toMatch(/^\/api\/opening-explorer\/masters\?fen=/);
    expect(screen.queryByRole('group', { name: 'Ratings' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Lichess' }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    const lichessUrl = fetchFn.mock.calls[1]![0];
    expect(lichessUrl).toMatch(/^\/api\/opening-explorer\/lichess\?fen=/);
    expect(lichessUrl).toContain('ratings=1600,1800,2000,2200,2500');
    expect(lichessUrl).toContain('speeds=blitz,rapid');

    const ratings = screen.getByRole('group', { name: 'Ratings' });
    await userEvent.click(within(ratings).getByRole('button', { name: '2500+' }));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Speeds' })).getByRole('button', { name: 'Bullet' }),
    );
    await waitFor(() =>
      expect(fetchFn.mock.calls.at(-1)![0]).toContain(
        'ratings=1600,1800,2000,2200&speeds=bullet,blitz,rapid',
      ),
    );
    expect(within(ratings).getByRole('button', { name: '2500+' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows "Explorer unavailable" with a working Retry', async () => {
    let fail = true;
    const { service } = setup(() => (fail ? { status: 429 } : { status: 200, body: E4_BODY }));
    render(<ExplorerPanel fen={AFTER_E4} onPlayMove={() => {}} service={service} />);

    expect(await screen.findByText('Explorer unavailable')).toBeInTheDocument();
    expect(screen.getByText(/rate-limiting/i)).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(screen.queryByText('Explorer unavailable')).toBeNull();
  });

  it('shows a loading state, then an empty state for an unknown position', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { service } = setup(async () => {
      await gate;
      return { status: 200, body: raw([]) };
    });
    render(<ExplorerPanel fen={AFTER_E4} onPlayMove={() => {}} service={service} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading opening statistics');
    release();
    expect(await screen.findByText('No games from this position.')).toBeInTheDocument();
  });

  it('cancels a stale request so it cannot overwrite the newer position', async () => {
    let releaseE4!: () => void;
    const e4Gate = new Promise<void>((r) => (releaseE4 = r));
    const { fetchFn, service } = setup(async (url) => {
      if (url.includes(encodeURIComponent(AFTER_E4))) {
        await e4Gate;
        return { status: 200, body: E4_BODY };
      }
      return { status: 200, body: D4_BODY };
    });
    const { rerender } = render(
      <ExplorerPanel fen={AFTER_E4} onPlayMove={() => {}} service={service} />,
    );
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    const firstSignal = (fetchFn.mock.calls[0] as unknown[])[1] as { signal?: AbortSignal };

    rerender(<ExplorerPanel fen={AFTER_D4} onPlayMove={() => {}} service={service} />);
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(firstSignal.signal?.aborted).toBe(true);

    releaseE4();
    await new Promise((r) => setTimeout(r, 20));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveAccessibleName(/^Nf6/);
  });
});

describe('result bar colors', () => {
  it('keeps every % label at 4.5:1 or better on its segment', () => {
    for (const { fill, ink } of Object.values(RESULT_BAR)) {
      expect(contrastRatio(fill, ink)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
