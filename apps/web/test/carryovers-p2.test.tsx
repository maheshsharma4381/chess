import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import { BOTS, botById, createRng } from '@chess/bots';
import type { EngineLine } from '@chess/types';
import { InteractiveBoard } from '@/components/board/InteractiveBoard';
import { CapturedPieces } from '@/components/game/CapturedPieces';
import { BotGame } from '@/components/play/BotGame';
import { avatarInk, coordinateInks } from '@/lib/design/ink';
import { contrastRatio } from '@/lib/design/contrast';
import { BOARD_THEMES, COLORS, ECO_TEXT } from '@/lib/design/tokens';
import { createEngineStore } from '@/lib/engine/browserEngine';
import { createBotGame, type BotEngine } from '@/lib/game/botGameStore';

const tick = () => new Promise((r) => setTimeout(r, 5));
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 300 && !cond(); i++) await tick();
};
const line = (uci: string): EngineLine => ({ uci, pv: [uci], score: { cp: 0 }, depth: 8 });

/** Plays a scripted move per ply (counted from the FEN), else the first legal move. */
const scripted = (script: Record<number, string> = {}): BotEngine => ({
  async bestMove(fen) {
    const c = new Chess(fen);
    const ply = (Number(fen.split(' ')[5]) - 1) * 2 + (c.turn() === 'b' ? 1 : 0) + 1;
    const uci = script[ply] ?? c.moves({ verbose: true })[0]!.lan;
    return { bestmove: uci, lines: [line(uci)] };
  },
  async analyse() {
    return [line('a2a3')];
  },
});

const game = (opts: Partial<Parameters<typeof createBotGame>[0]> & { engine?: BotEngine } = {}) =>
  createBotGame({
    bot: botById('engine-max'),
    userColor: 'w',
    mode: 'friendly',
    getEngine: async () => opts.engine ?? scripted(),
    rng: createRng(1),
    ...opts,
  });

describe('bot game lifecycle', () => {
  it('dispose() aborts the search and ignores its late reply', async () => {
    let release: () => void = () => {};
    let aborted = false;
    const engine: BotEngine = {
      bestMove: (_f, o) =>
        new Promise((resolve) => {
          o.signal?.addEventListener('abort', () => (aborted = true));
          release = () => resolve({ bestmove: 'e7e5', lines: [line('e7e5')] });
        }),
      analyse: async () => [],
    };
    const g = game({ engine });
    g.getState().start();
    g.getState().userMove({ from: 'e2', to: 'e4' });
    await until(() => g.getState().thinking);
    g.getState().dispose();
    expect(aborted).toBe(true);
    release();
    await tick();
    expect(g.getState().history).toHaveLength(1);
  });

  it('aborts the Friendly-mode evaluation on takeback', async () => {
    let evalAborted = false;
    const engine: BotEngine = {
      bestMove: scripted({ 2: 'e7e5' }).bestMove,
      analyse: (_f, o) =>
        new Promise(() => {
          o.signal?.addEventListener('abort', () => (evalAborted = true));
        }),
    };
    const g = game({ engine });
    g.getState().start();
    g.getState().userMove({ from: 'e2', to: 'e4' });
    await until(() => g.getState().history.length === 2);
    await tick();
    g.getState().takeback();
    expect(evalAborted).toBe(true);
  });

  it('allows a takeback after the game is over in Friendly mode', async () => {
    const g = game({ engine: scripted({ 2: 'e7e5', 4: 'd8h4' }) });
    g.getState().start();
    g.getState().userMove({ from: 'f2', to: 'f3' });
    await until(() => g.getState().history.length === 2);
    g.getState().userMove({ from: 'g2', to: 'g4' });
    await until(() => g.getState().status === 'over');
    expect(g.getState().takeback()).toBe(true);
    expect(g.getState().status).toBe('playing');
    expect(g.getState().result).toBeNull();
    expect(g.getState().history).toHaveLength(2);
  });

  it('ends the game on insufficient material', () => {
    const g = game({ startFen: 'k7/8/8/8/8/8/1n6/K7 w - - 0 1' });
    g.getState().start();
    g.getState().userMove({ from: 'a1', to: 'b2' });
    expect(g.getState().result).toEqual({ winner: null, reason: 'insufficient' });
  });

  it('ends the game on threefold repetition', async () => {
    const g = game({
      startFen: '7k/8/8/8/8/8/8/R6K w - - 0 1',
      engine: scripted({ 2: 'h8g8', 4: 'g8h8', 6: 'h8g8', 8: 'g8h8' }),
    });
    g.getState().start();
    for (const [from, to] of [
      ['a1', 'a2'],
      ['a2', 'a1'],
      ['a1', 'a2'],
      ['a2', 'a1'],
    ] as const) {
      const before = g.getState().history.length;
      g.getState().userMove({ from, to });
      await until(
        () => g.getState().history.length === before + 2 || g.getState().status === 'over',
      );
    }
    expect(g.getState().result).toEqual({ winner: null, reason: 'threefold' });
  });

  it('ends the game by the 50-move rule', () => {
    const g = game({ startFen: '7k/8/8/8/8/8/8/R6K w - - 99 60' });
    g.getState().start();
    g.getState().userMove({ from: 'a1', to: 'a2' });
    expect(g.getState().result).toEqual({ winner: null, reason: 'fifty-move' });
  });
});

describe('<BotGame> lifecycle', () => {
  it('disposes the game on unmount', async () => {
    let aborted = false;
    const engine: BotEngine = {
      bestMove: (_f, o) =>
        new Promise(() => {
          o.signal?.addEventListener('abort', () => (aborted = true));
        }),
      analyse: async () => [],
    };
    const user = userEvent.setup();
    const { unmount } = render(<BotGame botId="maya" mode="friendly" color="w" engine={engine} />);
    await user.click(screen.getByRole('button', { name: /^e2,/ }));
    await user.click(screen.getByRole('button', { name: /^e4,/ }));
    await act(tick);
    unmount();
    expect(aborted).toBe(true);
  });

  it('starts New game with a fresh board and follows the color prop', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <BotGame botId="maya" mode="friendly" color="w" engine={scripted()} />,
    );
    const firstGrid = screen.getByRole('grid');
    await user.click(screen.getByRole('button', { name: /resign/i }));
    await user.click(screen.getByRole('button', { name: /new game/i }));
    expect(screen.getByRole('grid')).not.toBe(firstGrid);

    rerender(<BotGame botId="maya" mode="friendly" color="b" engine={scripted()} />);
    const squares = screen.getAllByRole('button', { name: /^[a-h][1-8],/ });
    expect(squares[0]).toHaveAccessibleName(/^h1,/); // Black at the bottom
  });

  it('remembers the mute setting', async () => {
    window.localStorage.removeItem('chess.muted');
    const user = userEvent.setup();
    const { unmount } = render(
      <BotGame botId="maya" mode="friendly" color="w" engine={scripted()} />,
    );
    await user.click(screen.getByRole('button', { name: /^mute$/i }));
    unmount();
    render(<BotGame botId="maya" mode="friendly" color="w" engine={scripted()} />);
    expect(screen.getByRole('button', { name: /^unmute$/i })).toBeInTheDocument();
  });
});

describe('engine store', () => {
  it('reuses an in-flight start when retry() is called', async () => {
    let workers = 0;
    const store = createEngineStore({
      createWorker: () => {
        workers++;
        const w = {
          onmessage: null as ((e: { data: unknown }) => void) | null,
          onerror: null,
          postMessage(cmd: string) {
            const reply = cmd === 'uci' ? 'uciok' : cmd === 'isready' ? 'readyok' : null;
            if (reply) setTimeout(() => w.onmessage?.({ data: reply }), 5);
          },
          terminate() {},
        };
        return w;
      },
    });
    const first = store.getState().getEngine();
    const second = store.getState().retry();
    expect(await second).toBe(await first);
    expect(workers).toBe(1);
  });
});

describe('board details', () => {
  it('shows the drag ghost for a piece that exists only on the premove board', () => {
    render(<InteractiveBoard fen={new Chess().fen()} movable="b" onMove={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^e7,/ }));
    fireEvent.click(screen.getByRole('button', { name: /^e5,/ }));
    const grid = screen.getByRole('grid');
    grid.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 800, right: 800, bottom: 800 }) as DOMRect;
    // e5 = column 4, row 3 -> (450, 350)
    fireEvent.pointerDown(grid, { button: 0, clientX: 450, clientY: 350, pointerId: 3 });
    fireEvent.pointerMove(grid, { button: 0, clientX: 450, clientY: 420, pointerId: 3 });
    expect(screen.getByTestId('drag-ghost')).toHaveAttribute('src', '/pieces/cburnett/bP.svg');
  });

  it('cancels promotion with a button and returns focus to the board', async () => {
    const user = userEvent.setup();
    render(<InteractiveBoard fen="8/4P3/8/8/8/8/k7/4K3 w - - 0 1" movable="w" onMove={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /^e7,/ }));
    await user.click(screen.getByRole('button', { name: /^e8,/ }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toHaveAccessibleName(/^e8,/);
  });

  it('labels captured pieces as an image', () => {
    render(
      <CapturedPieces fen="r1bqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w KQkq - 0 1" side="w" />,
    );
    expect(screen.getByRole('img', { name: 'Captured: knight' })).toBeInTheDocument();
  });
});

describe('contrast fixes', () => {
  it('keeps board coordinates at 3:1 on every theme', () => {
    for (const [name, theme] of Object.entries(BOARD_THEMES)) {
      const ink = coordinateInks(theme);
      expect(contrastRatio(ink.onLight, theme.light), `${name} on light`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(ink.onDark, theme.dark), `${name} on dark`).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the opening ECO text at 4.5:1 on panels', () => {
    expect(contrastRatio(ECO_TEXT, COLORS.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('picks avatar initials that read on every tier color', () => {
    for (const bot of BOTS) {
      expect(
        contrastRatio(avatarInk(bot.avatar.color), bot.avatar.color),
        bot.id,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
