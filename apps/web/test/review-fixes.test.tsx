import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import { botById, createRng } from '@chess/bots';
import type { EngineLine } from '@chess/types';
import { InteractiveBoard } from '@/components/board/InteractiveBoard';
import { BotGame, EngineNotice } from '@/components/play/BotGame';
import { SiteFooter } from '@/components/SiteFooter';
import LicensesPage from '@/app/about/licenses/page';
import { boardReducer, initialBoardState } from '@/lib/board/reducer';
import { createEngineStore } from '@/lib/engine/browserEngine';
import { createBotGame, type BotEngine } from '@/lib/game/botGameStore';
import { sanToWords } from '@/lib/game/speech';

const tick = () => new Promise((r) => setTimeout(r, 5));
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await tick();
};
const START = new Chess().fen();
const after = (sans: string) => {
  const c = new Chess();
  for (const s of sans.split(' ')) c.move(s);
  return c.fen();
};
const line = (uci: string): EngineLine => ({ uci, pv: [uci], score: { cp: 0 }, depth: 8 });

describe('engine failure on retry (critical)', () => {
  it('shows the error again when the restart also fails, instead of going silent', async () => {
    const game = createBotGame({
      bot: botById('maya'),
      userColor: 'w',
      mode: 'friendly',
      getEngine: async () => {
        throw new Error('WASM failed to load');
      },
      restartEngine: async () => {
        throw new Error('still unreachable');
      },
      rng: createRng(1),
    });
    game.getState().start();
    game.getState().userMove({ from: 'e2', to: 'e4' });
    await until(() => game.getState().engineError !== null);
    await game.getState().retryEngine();
    expect(game.getState().engineError).toMatch(/still unreachable/);
    expect(game.getState().thinking).toBe(false);
  });

  it('renders the engine notice for an engine-store error even without a game error', () => {
    render(
      <EngineNotice
        error={null}
        engineStatus="error"
        engineMessage="worker died"
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/worker died/);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

describe('takeback with queued premoves', () => {
  it('drops premoves when the new position is not one opponent move away (a takeback)', () => {
    // User is White; after 1.e4 the bot is thinking and the user premoves Nf3.
    let s = initialBoardState({ fen: after('e4'), movable: 'w' });
    s = boardReducer(s, { type: 'squareClicked', square: 'g1' });
    s = boardReducer(s, { type: 'squareClicked', square: 'f3' });
    expect(s.premoves).toHaveLength(1);
    // Take back: the position returns to the start (White to move), which no Black move produces.
    s = boardReducer(s, { type: 'positionChanged', fen: START });
    expect(s.intent).toBeNull();
    expect(s.premoves).toEqual([]);
  });

  it('still plays the premove after a genuine opponent reply', () => {
    let s = initialBoardState({ fen: after('e4'), movable: 'w' });
    s = boardReducer(s, { type: 'squareClicked', square: 'g1' });
    s = boardReducer(s, { type: 'squareClicked', square: 'f3' });
    s = boardReducer(s, { type: 'positionChanged', fen: after('e4 e5') });
    expect(s.intent).toEqual({ from: 'g1', to: 'f3', premove: true });
  });
});

describe("strength-limited bots play Stockfish's bestmove", () => {
  it("uses the engine's bestmove rather than the PV head", async () => {
    const engine: BotEngine = {
      async bestMove() {
        return { bestmove: 'g8f6', lines: [line('e7e5'), line('c7c5')] };
      },
      async analyse() {
        return [line('g1f3')];
      },
    };
    const game = createBotGame({
      bot: botById('maya'), // 1400: UCI_Elo bot
      userColor: 'w',
      mode: 'challenge',
      getEngine: async () => engine,
      rng: createRng(1),
    });
    game.getState().start();
    game.getState().userMove({ from: 'e2', to: 'e4' });
    await until(() => game.getState().history.length === 2);
    expect(game.getState().history[1]?.san).toBe('Nf6');
  });
});

describe('keyboard focus stays visible above the pieces', () => {
  it('draws the focus ring in an overlay above the piece layer, not by raising the square', async () => {
    const user = userEvent.setup();
    render(<InteractiveBoard fen={START} movable="w" onMove={vi.fn()} />);
    await user.tab();
    const ring = screen.getByTestId('focus-ring');
    const pieces = screen.getByTestId('piece-a1').parentElement as HTMLElement;
    // The ring layer comes after the piece layer in the stacking order.
    expect(pieces.compareDocumentPosition(ring) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ring).toHaveAttribute('data-square', 'a1');
    const a1 = screen.getByRole('button', { name: /^a1,/ });
    expect(a1.className).not.toMatch(/focus-visible:z-/);
  });
});

describe('screen reader announcements', () => {
  it('speaks SAN as words', () => {
    expect(sanToWords('Nf3')).toBe('knight f3');
    expect(sanToWords('exd5')).toBe('e takes d5');
    expect(sanToWords('O-O')).toBe('castles kingside');
    expect(sanToWords('O-O-O+')).toBe('castles queenside, check');
    expect(sanToWords('Qxf7#')).toBe('queen takes f7, checkmate');
    expect(sanToWords('e8=Q')).toBe('e8 promotes to queen');
  });

  it("announces the bot's move and the result in a live region", async () => {
    const engine: BotEngine = {
      async bestMove(fen) {
        const uci = new Chess(fen).moves({ verbose: true }).find((m) => m.san === 'e5')!.lan;
        return { bestmove: uci, lines: [line(uci)] };
      },
      async analyse() {
        return [line('g1f3')];
      },
    };
    const user = userEvent.setup();
    render(<BotGame botId="maya" mode="friendly" color="w" engine={engine} />);
    await user.click(screen.getByRole('button', { name: /^e2,/ }));
    await user.click(screen.getByRole('button', { name: /^e4,/ }));
    const updates = screen.getByRole('log', { name: /game updates/i });
    await waitFor(() => expect(updates).toHaveTextContent('Maya played e5'));
    await user.click(screen.getByRole('button', { name: /resign/i }));
    expect(updates).toHaveTextContent(/Maya wins/);
  });

  it('includes selection, legal-move and premove state in square names', async () => {
    const user = userEvent.setup();
    render(<InteractiveBoard fen={START} movable="w" onMove={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /^e2,/ }));
    expect(screen.getByRole('button', { name: 'e2, white pawn, selected' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'e4, empty, legal move' })).toBeInTheDocument();
  });
});

describe('unresponsive engines', () => {
  it('terminates a worker that never finished starting', async () => {
    const workers: Array<{ terminated: boolean }> = [];
    const store = createEngineStore({
      readyTimeoutMs: 20,
      createWorker: () => {
        const w = {
          terminated: false,
          onmessage: null,
          onerror: null,
          postMessage() {},
          terminate() {
            w.terminated = true;
          },
        };
        workers.push(w);
        return w;
      },
    });
    await expect(store.getState().getEngine()).rejects.toThrow();
    expect(workers[0]?.terminated).toBe(true);
  });
});

describe('licenses are reachable and point at the shipped source', () => {
  it('links the licenses page from the footer', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('link', { name: /licenses/i })).toHaveAttribute(
      'href',
      '/about/licenses',
    );
  });

  it('links the exact stockfish.js release and its license text', () => {
    render(<LicensesPage />);
    expect(screen.getByRole('link', { name: /stockfish\.js source/i })).toHaveAttribute(
      'href',
      expect.stringContaining('v19.0.1'),
    );
    expect(screen.getByRole('link', { name: /Copying\.txt/ })).toHaveAttribute(
      'href',
      '/engine/Copying.txt',
    );
  });
});
