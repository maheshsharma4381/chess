import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import { normalizeEpd, type EngineAdapter } from '@chess/chess-core';
import type { EngineLine } from '@chess/types';
import { GameReview } from '@/components/review/GameReview';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const SCHOLARS = '[White "You"]\n[Black "Maya"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0';
const epdAfter = (sans: string) => {
  const c = new Chess();
  for (const s of sans.split(' ')) c.move(s);
  return normalizeEpd(c.fen());
};
const SCRIPT: Record<string, EngineLine[]> = {
  [epdAfter('e4 e5 Bc4 Nc6 Qh5')]: [
    { uci: 'g7g6', pv: ['g7g6', 'h5f3'], score: { cp: -20 }, depth: 10 },
    { uci: 'd8e7', pv: ['d8e7'], score: { cp: -35 }, depth: 10 },
  ],
  [epdAfter('e4 e5 Bc4 Nc6 Qh5 Nf6')]: [
    { uci: 'h5f7', pv: ['h5f7'], score: { mate: 1 }, depth: 10 },
  ],
};

const scripted = (onCall?: (signalled: boolean) => void): EngineAdapter => ({
  async analyse(fen, opts) {
    onCall?.(Boolean(opts.signal));
    const lines = SCRIPT[normalizeEpd(fen)];
    if (lines) return lines;
    const m = new Chess(fen).moves({ verbose: true })[0]!;
    return [{ uci: m.lan, pv: [m.lan], score: { cp: 0 }, depth: 10 }];
  },
});

const reviewed = async () => {
  render(<GameReview pgn={SCHOLARS} engine={scripted()} />);
  await waitFor(
    () => expect(screen.getByRole('region', { name: /review summary/i })).toBeInTheDocument(),
    {
      timeout: 30_000,
    },
  );
};

describe('<GameReview>', () => {
  it('shows progress, then the summary with player names', async () => {
    render(<GameReview pgn={SCHOLARS} engine={scripted()} />);
    expect(screen.getByRole('progressbar', { name: /analysing/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Maya accuracy')).toBeInTheDocument(), {
      timeout: 30_000,
    });
    expect(screen.getByLabelText('You accuracy')).toBeInTheDocument();
  });

  it('jumps to a move from the move list and the coach explains it', async () => {
    const user = userEvent.setup();
    await reviewed();
    const moves = screen.getByRole('table', { name: 'Moves' });
    await user.click(within(moves).getByRole('button', { name: /Nf6/ }));
    expect(screen.getByRole('heading', { name: /Nf6\?\? is a Blunder/ })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /evaluation graph/i })).toHaveAttribute(
      'aria-valuenow',
      '6',
    );
  });

  it('stops the Show Moves preview when the user navigates', async () => {
    const user = userEvent.setup();
    await reviewed();
    await user.click(
      within(screen.getByRole('table', { name: 'Moves' })).getByRole('button', { name: /Nf6/ }),
    );
    await user.click(screen.getByRole('button', { name: /show moves/i }));
    expect(screen.getByText(/showing engine line/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^g6,/ })).toHaveAccessibleName(/black pawn/);
    await user.click(screen.getByRole('button', { name: /previous move/i }));
    expect(screen.queryByText(/showing engine line/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^g6,/ })).toHaveAccessibleName(/empty/);
  });

  it('lets the user retry a blunder on an interactive board, then return', async () => {
    const user = userEvent.setup();
    await reviewed();
    await user.click(
      within(screen.getByRole('table', { name: 'Moves' })).getByRole('button', { name: /Nf6/ }),
    );
    await user.click(screen.getByRole('button', { name: /retry move/i }));
    expect(screen.getByText(/find the best move/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^g7,/ }));
    await user.click(screen.getByRole('button', { name: /^g6,/ }));
    expect(screen.getByText(/correct/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /back to review/i }));
    expect(screen.queryByText(/find the best move/i)).not.toBeInTheDocument();
  });

  it('cancels the analysis when the page goes away', async () => {
    let aborted = false;
    const slow: EngineAdapter = {
      analyse: (_fen, opts) =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    };
    const { unmount } = render(<GameReview pgn={SCHOLARS} engine={slow} />);
    await new Promise((r) => setTimeout(r, 50));
    unmount();
    expect(aborted).toBe(true);
  });

  it('explains an illegal PGN instead of crashing', async () => {
    render(<GameReview pgn="1. e4 e5 2. Nf9" engine={scripted()} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Illegal move "Nf9"/), {
      timeout: 30_000,
    });
  });
});
