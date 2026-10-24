import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { BotGame } from '@/components/play/BotGame';
import type { BotEngine } from '@/lib/game/botGameStore';

const firstMoveEngine: BotEngine = {
  async bestMove(fen) {
    const uci = new Chess(fen).moves({ verbose: true }).find((m) => m.san === 'e5')?.lan ?? 'a7a6';
    return { bestmove: uci, lines: [{ uci, pv: [uci], score: { cp: 10 }, depth: 8 }] };
  },
  async analyse() {
    return [{ uci: 'g1f3', pv: ['g1f3'], score: { cp: 25 }, depth: 12 }];
  },
};

const square = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name},`) });

describe('<BotGame>', () => {
  it('plays a move, shows the bot reply, its speech, the eval bar and the controls', async () => {
    const user = userEvent.setup();
    render(<BotGame botId="maya" mode="friendly" color="w" engine={firstMoveEngine} />);

    expect(screen.getByText('Maya')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /maya says/i })).toHaveTextContent(/\S/);
    expect(screen.getByRole('meter', { name: /evaluation/i })).toBeInTheDocument();

    await user.click(square('e2'));
    await user.click(square('e4'));
    await waitFor(() => expect(screen.getByRole('button', { name: /^e5$/ })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^e4$/ })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /take back/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /hint/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /resign/i }));
    expect(screen.getByRole('heading', { name: /maya wins/i })).toBeInTheDocument();
  });

  it('hides help in Challenge mode', () => {
    render(<BotGame botId="maya" mode="challenge" color="w" engine={firstMoveEngine} />);
    expect(screen.queryByRole('meter', { name: /evaluation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /take back/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hint/i })).not.toBeInTheDocument();
  });
});
