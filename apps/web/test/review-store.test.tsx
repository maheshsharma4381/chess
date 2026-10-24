import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import { OpeningLookupService, loadEcoBook, type EngineAdapter } from '@chess/chess-core';
import { botById, createRng } from '@chess/bots';
import type { EngineLine } from '@chess/types';
import { PgnPaste } from '@/components/review/PgnPaste';
import { createBotGame } from '@/lib/game/botGameStore';
import { createReviewStore } from '@/lib/review/reviewStore';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const book = new OpeningLookupService(loadEcoBook());
const loadBook = async () => book;

const firstMove: EngineAdapter = {
  async analyse(fen) {
    const m = new Chess(fen).moves({ verbose: true })[0]!;
    return [{ uci: m.lan, pv: [m.lan], score: { cp: 10 }, depth: 10 } satisfies EngineLine];
  },
};

describe('review store', () => {
  it('runs the review with progress up to plies + 1', async () => {
    const store = createReviewStore({ getEngine: async () => firstMove, loadBook });
    const seen: number[] = [];
    store.subscribe((s) => seen.push(s.progress.done));
    await store.getState().run('1. e4 e5 2. Nf3');
    const s = store.getState();
    expect(s.status).toBe('done');
    expect(s.report?.moves).toHaveLength(3);
    expect(s.progress).toEqual({ done: 4, total: 4 });
    expect(Math.max(...seen)).toBe(4);
  });

  it('cancels a running review and returns to idle', async () => {
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
    const store = createReviewStore({ getEngine: async () => slow, loadBook });
    const run = store.getState().run('1. e4 e5');
    await new Promise((r) => setTimeout(r, 10));
    store.getState().cancel();
    await run;
    expect(aborted).toBe(true);
    expect(store.getState().status).toBe('idle');
  });

  it('reports an illegal PGN with the offending move', async () => {
    const store = createReviewStore({ getEngine: async () => firstMove, loadBook });
    await store.getState().run('1. e4 e5 2. Nf9');
    expect(store.getState().status).toBe('error');
    expect(store.getState().error).toMatch(/Illegal move "Nf9" at ply 3/);
  });

  it('handles a game with no moves', async () => {
    const store = createReviewStore({ getEngine: async () => firstMove, loadBook });
    await store.getState().run('[Event "Empty"]\n\n*');
    expect(store.getState().status).toBe('done');
    expect(store.getState().report?.moves).toEqual([]);
  });

  it('clamps navigation to the game', async () => {
    const store = createReviewStore({ getEngine: async () => firstMove, loadBook });
    await store.getState().run('1. e4 e5');
    store.getState().setPly(9);
    expect(store.getState().ply).toBe(2);
    store.getState().setPly(-3);
    expect(store.getState().ply).toBe(0);
  });

  it('cancels the previous run when a new one starts', async () => {
    let firstAborted = false;
    let calls = 0;
    const engine: EngineAdapter = {
      analyse: (fen, opts) => {
        calls++;
        if (calls === 1) {
          return new Promise((_resolve, reject) => {
            opts.signal?.addEventListener('abort', () => {
              firstAborted = true;
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            });
          });
        }
        return firstMove.analyse(fen, opts);
      },
    };
    const store = createReviewStore({ getEngine: async () => engine, loadBook });
    const first = store.getState().run('1. d4');
    await new Promise((r) => setTimeout(r, 10));
    await store.getState().run('1. e4 e5');
    await first;
    expect(firstAborted).toBe(true);
    expect(store.getState().report?.moves.map((m) => m.san)).toEqual(['e4', 'e5']);
  });
});

describe('<PgnPaste>', () => {
  it('asks for a game when the box is empty', async () => {
    const user = userEvent.setup();
    render(<PgnPaste />);
    await user.click(screen.getByRole('button', { name: /review game/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/paste a game/i);
  });

  it('explains an illegal move before navigating', async () => {
    const user = userEvent.setup();
    render(<PgnPaste />);
    await user.type(screen.getByLabelText(/pgn/i), '1. e4 e5 2. Nf9');
    await user.click(screen.getByRole('button', { name: /review game/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Nf9/);
    expect(push).not.toHaveBeenCalled();
  });

  it('opens the review for a valid game', async () => {
    const user = userEvent.setup();
    render(<PgnPaste />);
    await user.type(screen.getByLabelText(/pgn/i), '1. e4 e5');
    await user.click(screen.getByRole('button', { name: /review game/i }));
    expect(push).toHaveBeenCalledWith(`/review?pgn=${encodeURIComponent('1. e4 e5')}`);
  });
});

describe('Review button after a bot game', () => {
  it('links to Game Review with the game PGN', async () => {
    const { BotGame } = await import('@/components/play/BotGame');
    const user = userEvent.setup();
    render(
      <BotGame
        botId="maya"
        mode="friendly"
        color="w"
        engine={{
          bestMove: async () => ({ bestmove: 'e7e5', lines: [] }),
          analyse: async () => [],
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /resign/i }));
    const link = screen.getByRole('link', { name: /game review/i });
    const href = link.getAttribute('href') ?? '';
    expect(href.startsWith('/review?pgn=')).toBe(true);
    expect(decodeURIComponent(href.slice('/review?pgn='.length))).toContain('[Result "0-1"]');
  });
});

describe('bot game PGN', () => {
  it('exports the finished game with players and result', async () => {
    const game = createBotGame({
      bot: botById('maya'),
      userColor: 'w',
      mode: 'friendly',
      getEngine: async () => ({
        bestMove: async () => ({ bestmove: 'e7e5', lines: [] }),
        analyse: async () => [],
      }),
      rng: createRng(1),
    });
    game.getState().start();
    game.getState().userMove({ from: 'e2', to: 'e4' });
    await new Promise((r) => setTimeout(r, 30));
    game.getState().resign();
    const pgn = game.getState().toPgn();
    expect(pgn).toContain('[White "You"]');
    expect(pgn).toContain('[Black "Maya"]');
    expect(pgn).toContain('[Result "0-1"]');
    expect(pgn).toMatch(/1\. e4 e5/);
  });
});
