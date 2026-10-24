import { StrictMode } from 'react';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeEpd, type EngineAdapter, OpeningExplorerService } from '@chess/chess-core';
import type { EngineLine } from '@chess/types';
import { BotGame } from '@/components/play/BotGame';
import { ExplorerPanel } from '@/components/explorer/ExplorerPanel';
import { MoveList } from '@/components/game/MoveList';
import { EvalGraph } from '@/components/review/EvalGraph';
import { GameReview } from '@/components/review/GameReview';
import type { BotEngine } from '@/lib/game/botGameStore';
import { readEnvValue } from '@/lib/server/env';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => localStorage.clear());

const square = (name: string) =>
  within(screen.getByRole('grid', { name: /chess board/i })).getByRole('button', {
    name: new RegExp(`^${name},`),
  });

describe('BotGame under StrictMode (dev double effects)', () => {
  it('still lets the bot reply after the mount-cleanup-mount cycle', async () => {
    const engine: BotEngine = {
      async bestMove(fen) {
        const uci = new Chess(fen).moves({ verbose: true }).find((m) => m.san === 'e5')!.lan;
        return { bestmove: uci, lines: [{ uci, pv: [uci], score: { cp: 0 }, depth: 8 }] };
      },
      async analyse() {
        return [{ uci: 'g1f3', pv: ['g1f3'], score: { cp: 20 }, depth: 8 }];
      },
    };
    const user = userEvent.setup();
    render(
      <StrictMode>
        <BotGame botId="maya" mode="friendly" color="w" engine={engine} />
      </StrictMode>,
    );
    await user.click(square('e2'));
    await user.click(square('e4'));
    await waitFor(() => expect(screen.getByRole('button', { name: /^e5$/ })).toBeInTheDocument());
  });
});

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
const scripted: EngineAdapter = {
  async analyse(fen) {
    const lines = SCRIPT[normalizeEpd(fen)];
    if (lines) return lines;
    const m = new Chess(fen).moves({ verbose: true })[0]!;
    return [{ uci: m.lan, pv: [m.lan], score: { cp: 0 }, depth: 10 }];
  },
};
const reviewed = async (pgn = SCHOLARS) => {
  render(<GameReview pgn={pgn} engine={scripted} />);
  await screen.findByRole('region', { name: /review summary/i }, { timeout: 30_000 });
};
const toPly = async (ply: number) => {
  const moves = within(screen.getByRole('table', { name: 'Moves' })).getAllByRole('button');
  await userEvent.click(moves[ply - 1]!);
};

describe('<GameReview> fixes', () => {
  it('leaves Retry when a deeper review starts and keeps the report while it runs', async () => {
    await reviewed();
    await toPly(6);
    await userEvent.click(screen.getByRole('button', { name: 'Retry Move' }));
    expect(screen.getByRole('region', { name: 'Retry move' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /deeper review/i }));
    expect(screen.queryByRole('region', { name: 'Retry move' })).toBeNull();
    await screen.findByRole('region', { name: /review summary/i }, { timeout: 30_000 });
    expect(screen.queryByRole('region', { name: 'Retry move' })).toBeNull();
    expect(screen.queryByText('Showing engine line')).toBeNull();
  });

  it('shows the solved move on the board after a correct retry', async () => {
    await reviewed();
    await toPly(6);
    await userEvent.click(screen.getByRole('button', { name: 'Retry Move' }));
    await userEvent.click(square('g7'));
    await userEvent.click(square('g6'));
    expect(await screen.findByText(/^Correct!/)).toBeInTheDocument();
    expect(square('g6')).toHaveAccessibleName(/black pawn/);
  });

  it('remembers the coach language', async () => {
    await reviewed();
    await userEvent.click(screen.getByRole('button', { name: 'Hinglish' }));
    expect(localStorage.getItem('chess.coachLang')).toBe('hinglish');
  });

  it('starts in Hinglish when it was chosen before', async () => {
    localStorage.setItem('chess.coachLang', 'hinglish');
    await reviewed();
    expect(screen.getByRole('button', { name: 'Hinglish' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('offers a way back when the game cannot be reviewed', async () => {
    render(<GameReview pgn="1. e4 e5 2. Ke3" engine={scripted} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /paste another game/i })).toHaveAttribute(
      'href',
      '/review',
    );
  });
});

const BLACK_FIRST = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('Black-first numbering', () => {
  it('MoveList puts the first move in Black’s column with an ellipsis row', () => {
    render(<MoveList sans={['e5', 'Nf3', 'Nc6']} currentPly={0} startFen={BLACK_FIRST} />);
    const rows = within(screen.getByRole('table', { name: 'Moves' })).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(/^1\.\s*…?\s*e5$/);
    expect(rows[1]).toHaveTextContent(/^2\.\s*Nf3\s*Nc6$/);
    // Ply numbers are still 1-based in game order.
    expect(within(rows[0]!).getByRole('button', { name: 'e5' })).toBeInTheDocument();
  });

  it('MoveList honours the FEN move number', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    render(<MoveList sans={['Bb5']} currentPly={0} startFen={fen} />);
    expect(screen.getByRole('row')).toHaveTextContent(/^3\.\s*Bb5/);
  });

  it('EvalGraph names moves with the right number for a Black-first game', () => {
    render(
      <EvalGraph
        winGraph={[50, 50, 50]}
        moves={[
          { san: 'e5', classification: 'good' },
          { san: 'Nf3', classification: 'good' },
        ]}
        ply={1}
        orientation="white"
        onPly={() => {}}
        startFen={BLACK_FIRST}
      />,
    );
    expect(screen.getByRole('slider', { name: 'Evaluation graph' })).toHaveAttribute(
      'aria-valuetext',
      expect.stringMatching(/^Move 1\.\.\. e5/),
    );
  });

  it('a review of a Black-first PGN works end to end', async () => {
    const c = new Chess(BLACK_FIRST);
    c.move('e5');
    c.move('Nf3');
    await reviewed(c.pgn());
    const rows = within(screen.getByRole('table', { name: 'Moves' })).getAllByRole('row');
    expect(rows[0]).toHaveTextContent(/e5/);
    // Book badges add a glyph before each move.
    expect(rows[1]).toHaveTextContent(/^2\..*Nf3/);
  });
});

describe('EvalGraph with no moves', () => {
  it('draws a flat band instead of a wedge', () => {
    const { container } = render(
      <EvalGraph winGraph={[50]} moves={[]} ply={0} orientation="white" onPly={() => {}} />,
    );
    expect(container.querySelector('polygon')).toHaveAttribute(
      'points',
      '0,100 0,50 100,50 100,100',
    );
  });
});

describe('Explorer error announcement', () => {
  it('announces "Explorer unavailable" as an alert', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const service = new OpeningExplorerService({ baseUrl: '/api/opening-explorer', fetchFn });
    render(<ExplorerPanel fen={new Chess().fen()} onPlayMove={() => {}} service={service} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Explorer unavailable');
  });
});

describe('readEnvValue', () => {
  it('drops an inline comment after an unquoted value but keeps # inside quotes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'chess-env-'));
    const file = join(dir, '.env');
    writeFileSync(file, 'A=abc # note\nB="x # y"\nC=a#b\n');
    expect(readEnvValue(file, 'A')).toBe('abc');
    expect(readEnvValue(file, 'B')).toBe('x # y');
    expect(readEnvValue(file, 'C')).toBe('a#b');
  });
});
