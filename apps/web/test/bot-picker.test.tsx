import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BOTS } from '@chess/bots';
import { BotPicker } from '@/components/play/BotPicker';

describe('<BotPicker>', () => {
  it('lists the 12 bots in four tiers with their displayed ratings', () => {
    render(<BotPicker bots={BOTS} />);
    for (const tier of ['Beginner', 'Intermediate', 'Advanced', 'Master']) {
      expect(screen.getByRole('heading', { name: tier })).toBeInTheDocument();
    }
    const options = screen.getAllByRole('radio', { name: /\(\S+\)/ });
    expect(options).toHaveLength(12);
    expect(screen.getByRole('radio', { name: /Mystery \(\?\?\?\)/ })).toBeInTheDocument();
  });

  it('builds the game link from the chosen bot, mode and color', async () => {
    const user = userEvent.setup();
    render(<BotPicker bots={BOTS} />);
    const play = () => screen.getByRole('link', { name: /^play/i });
    expect(play()).toHaveAttribute('href', '/play/bots/pip?mode=friendly&color=w');

    await user.click(screen.getByRole('radio', { name: /Duke \(1300\)/ }));
    const modes = screen.getByRole('radiogroup', { name: /mode/i });
    await user.click(within(modes).getByRole('radio', { name: /challenge/i }));
    const colors = screen.getByRole('radiogroup', { name: /play as/i });
    await user.click(within(colors).getByRole('radio', { name: /black/i }));

    expect(play()).toHaveAttribute('href', '/play/bots/duke?mode=challenge&color=b');
    expect(screen.getByText(/queen out early/i)).toBeInTheDocument(); // selected bot's bio
  });
});
