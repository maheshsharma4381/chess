import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { botById, createRng } from '@chess/bots';
import type { EngineLine, SoundEvent } from '@chess/types';
import { createBotGame, type BotEngine } from '@/lib/game/botGameStore';

const tick = () => new Promise((r) => setTimeout(r, 5));
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await tick();
};

/** Plays the scripted move for each position (by ply), or the first legal move. */
class ScriptedEngine implements BotEngine {
  calls = 0;
  constructor(private readonly script: Record<number, string> = {}) {}
  async bestMove(fen: string) {
    this.calls++;
    const chess = new Chess(fen);
    const ply = (Number(fen.split(' ')[5]) - 1) * 2 + (chess.turn() === 'b' ? 1 : 0) + 1;
    const uci = this.script[ply] ?? chess.moves({ verbose: true })[0]!.lan;
    const lines: EngineLine[] = [{ uci, pv: [uci], score: { cp: 20 }, depth: 10 }];
    return { bestmove: uci, lines };
  }
  async analyse(fen: string) {
    const first = new Chess(fen).moves({ verbose: true })[0]!;
    return [{ uci: first.lan, pv: [first.lan], score: { cp: 35 }, depth: 12 }];
  }
}

const setup = (opts: Partial<Parameters<typeof createBotGame>[0]> = {}) => {
  const sounds: SoundEvent[] = [];
  const engine = (opts as { engine?: BotEngine }).engine ?? new ScriptedEngine();
  const game = createBotGame({
    bot: botById('engine-max'),
    userColor: 'w',
    mode: 'friendly',
    getEngine: async () => engine,
    rng: createRng(1),
    onSound: (e) => sounds.push(e),
    ...opts,
  });
  return { game, sounds, engine };
};

describe('bot game', () => {
  it('greets, lets the user move and replies with the bot move', async () => {
    const { game, sounds } = setup({ engine: new ScriptedEngine({ 2: 'e7e5' }) } as never);
    game.getState().start();
    expect(game.getState().speech).toBeTruthy();
    expect(game.getState().userMove({ from: 'e2', to: 'e4' })).toBe(true);
    await until(() => game.getState().history.length === 2);
    expect(game.getState().history.map((m) => m.san)).toEqual(['e4', 'e5']);
    expect(game.getState().lastMove).toEqual(['e7', 'e5']);
    expect(sounds.slice(0, 3)).toEqual(['game-start', 'move-self', 'move-opponent']);
  });

  it('lets the bot open when the user plays Black', async () => {
    const { game } = setup({ userColor: 'b', engine: new ScriptedEngine({ 1: 'd2d4' }) } as never);
    game.getState().start();
    await until(() => game.getState().history.length === 1);
    expect(game.getState().history[0]?.san).toBe('d4');
  });

  it('ignores user moves while the bot is thinking or on the wrong turn', async () => {
    let release: () => void = () => {};
    const slow: BotEngine = {
      bestMove: () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              bestmove: 'e7e5',
              lines: [{ uci: 'e7e5', pv: ['e7e5'], score: { cp: 0 }, depth: 1 }],
            });
        }),
      analyse: async () => [],
    };
    const { game } = setup({ engine: slow } as never);
    game.getState().start();
    game.getState().userMove({ from: 'e2', to: 'e4' });
    await until(() => game.getState().thinking);
    expect(game.getState().userMove({ from: 'd2', to: 'd4' })).toBe(false);
    release();
    await until(() => !game.getState().thinking);
    expect(game.getState().history).toHaveLength(2);
  });

  it('aborts the search on a takeback and ignores the late reply', async () => {
    let release: () => void = () => {};
    let aborted = false;
    const slow: BotEngine = {
      bestMove: (_fen, opts) =>
        new Promise((resolve) => {
          opts.signal?.addEventListener('abort', () => (aborted = true));
          release = () =>
            resolve({
              bestmove: 'e7e5',
              lines: [{ uci: 'e7e5', pv: ['e7e5'], score: { cp: 0 }, depth: 1 }],
            });
        }),
      analyse: async () => [],
    };
    const { game } = setup({ engine: slow } as never);
    game.getState().start();
    game.getState().userMove({ from: 'e2', to: 'e4' });
    await until(() => game.getState().thinking);
    expect(game.getState().takeback()).toBe(true);
    expect(aborted).toBe(true);
    release();
    await tick();
    await tick();
    expect(game.getState().history).toEqual([]);
    expect(game.getState().thinking).toBe(false);
    expect(game.getState().fen).toBe(new Chess().fen());
  });

  it('takes back the bot reply and the user move together', async () => {
    const { game } = setup();
    game.getState().start();
    game.getState().userMove({ from: 'e2', to: 'e4' });
    await until(() => game.getState().history.length === 2);
    game.getState().takeback();
    expect(game.getState().history).toEqual([]);
  });

  it('refuses takebacks and hints in Challenge mode', async () => {
    const { game } = setup({ mode: 'challenge' });
    game.getState().start();
    game.getState().userMove({ from: 'e2', to: 'e4' });
    await until(() => game.getState().history.length === 2);
    expect(game.getState().takeback()).toBe(false);
    expect(await game.getState().requestHint()).toBe(false);
    expect(game.getState().history).toHaveLength(2);
    expect(game.getState().evaluation).toBeNull();
  });

  it('gives a hint (the piece to move) and an evaluation in Friendly mode', async () => {
    const { game } = setup();
    game.getState().start();
    expect(await game.getState().requestHint()).toBe(true);
    expect(game.getState().hint).toBe('a2'); // ScriptedEngine.analyse: first legal move a2a3
    game.getState().userMove({ from: 'e2', to: 'e4' });
    await until(() => game.getState().evaluation !== null);
    expect(game.getState().hint).toBeNull();
  });

  it('surfaces engine failures with a retry instead of thinking forever', async () => {
    let fail = true;
    const engine = new ScriptedEngine();
    const game = createBotGame({
      bot: botById('engine-max'),
      userColor: 'w',
      mode: 'friendly',
      getEngine: async () => {
        if (fail) throw new Error('WASM failed to load');
        return engine;
      },
      rng: createRng(1),
    });
    game.getState().start();
    game.getState().userMove({ from: 'e2', to: 'e4' });
    await until(() => game.getState().engineError !== null);
    expect(game.getState().engineError).toMatch(/WASM failed/);
    expect(game.getState().thinking).toBe(false);
    fail = false;
    await game.getState().retryEngine();
    await until(() => game.getState().history.length === 2);
    expect(game.getState().engineError).toBeNull();
  });

  it("ends the game on checkmate (Fool's mate) with the bot's reaction", async () => {
    const { game, sounds } = setup({
      engine: new ScriptedEngine({ 2: 'e7e5', 4: 'd8h4' }),
    } as never);
    game.getState().start();
    game.getState().userMove({ from: 'f2', to: 'f3' });
    await until(() => game.getState().history.length === 2);
    game.getState().userMove({ from: 'g2', to: 'g4' });
    await until(() => game.getState().status === 'over');
    expect(game.getState().result).toEqual({ winner: 'b', reason: 'checkmate' });
    expect(game.getState().speech).toBeTruthy();
    expect(sounds.at(-1)).toBe('game-end');
    expect(game.getState().userMove({ from: 'a2', to: 'a3' })).toBe(false);
  });

  it('detects stalemate as a draw', async () => {
    const { game } = setup({ startFen: 'k7/8/1Q6/8/8/8/8/7K w - - 0 1' });
    game.getState().start();
    game.getState().userMove({ from: 'b6', to: 'c7' });
    expect(game.getState().result).toEqual({ winner: null, reason: 'stalemate' });
  });

  it('records promotions with the right SAN', () => {
    const { game } = setup({ startFen: '8/4P3/8/8/8/8/k7/4K3 w - - 0 1' });
    game.getState().start();
    game.getState().userMove({ from: 'e7', to: 'e8', promotion: 'n' });
    expect(game.getState().history[0]?.san).toBe('e8=N');
  });

  it('records a resignation as a loss for the user', () => {
    const { game } = setup();
    game.getState().start();
    game.getState().resign();
    expect(game.getState().result).toEqual({ winner: 'b', reason: 'resign' });
    expect(game.getState().status).toBe('over');
  });
});
