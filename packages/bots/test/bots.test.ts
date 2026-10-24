import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { BOT_EVENTS, type EngineLine } from '@chess/types';
import { BOTS, botById, botLine, botSearchParams, chooseBotMove, createRng } from '../src/index';

const START = new Chess().fen();
const legalUci = (fen: string) =>
  new Chess(fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''));
const line = (uci: string, cp: number): EngineLine => ({ uci, pv: [uci], score: { cp }, depth: 8 });

const SPREAD = [
  line('e2e4', 50),
  line('d2d4', 30),
  line('g1f3', 10),
  line('c2c4', -20),
  line('b1c3', -60),
  line('f2f4', -120),
  line('g2g4', -200),
  line('h2h4', -400),
];

describe('createRng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 100 }, () => a());
    expect(xs).toEqual(Array.from({ length: 100 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(createRng(43)()).not.toBe(xs[0]);
  });
});

describe('BOTS', () => {
  it('has 12 bots in 4 tiers with the spec ratings and unique ids', () => {
    expect(BOTS).toHaveLength(12);
    expect(new Set(BOTS.map((b) => b.id)).size).toBe(12);
    const ratings = (tier: string) => BOTS.filter((b) => b.tier === tier).map((b) => b.rating);
    expect(ratings('beginner')).toEqual([250, 400, 650]);
    expect(ratings('intermediate')).toEqual([1000, 1300, 1400]);
    expect(ratings('advanced')).toEqual([1500, 1800, 2000]);
    expect(ratings('master')).toEqual([2300, 3200, 3000]);
  });

  it('shows ??? for the Mystery bot while it plays at 3000', () => {
    expect(botById('mystery')).toMatchObject({ rating: 3000, displayRating: '???' });
  });

  it('makes the 1300 bot bring its queen out early', () => {
    const queenFan = BOTS.find((b) => b.rating === 1300);
    expect(queenFan?.style.earlyQueen).toBeGreaterThan(0.5);
  });

  it('gives every bot at least one line per event in English and Hinglish', () => {
    for (const bot of BOTS) {
      for (const event of BOT_EVENTS) {
        expect(bot.dialogue[event].en.length, `${bot.id} ${event} en`).toBeGreaterThan(0);
        expect(bot.dialogue[event].hinglish.length, `${bot.id} ${event} hinglish`).toBeGreaterThan(
          0,
        );
      }
    }
  });
});

describe('botSearchParams', () => {
  it('uses Stockfish UCI_Elo from 1320 up', () => {
    expect(botSearchParams(botById('viktor'))).toMatchObject({ elo: 2000, multiPv: 1 });
    expect(botSearchParams(botById('mystery'))).toMatchObject({ elo: 3000 });
  });

  it('plays the top bot at full strength', () => {
    const params = botSearchParams(botById('engine-max'));
    expect(params.elo).toBeUndefined();
    expect(params.multiPv).toBe(1);
  });

  it('asks weaker bots for several shallow candidates', () => {
    for (const bot of BOTS.filter((b) => b.rating < 1320)) {
      const p = botSearchParams(bot);
      expect(p.elo, bot.id).toBeUndefined();
      expect(p.multiPv, bot.id).toBeGreaterThanOrEqual(5);
      expect(p.depth, bot.id).toBeLessThanOrEqual(10);
    }
  });
});

describe('chooseBotMove', () => {
  const ctx = { fen: START, ply: 1, lines: SPREAD, legalUci: legalUci(START) };

  it('always plays the best line at full strength', () => {
    const rng = createRng(1);
    for (let i = 0; i < 50; i++)
      expect(chooseBotMove(botById('engine-max'), ctx, rng)).toBe('e2e4');
  });

  it('makes the 250 bot play a non-best move most of the time, sometimes a random one', () => {
    const rng = createRng(7);
    const picks = Array.from({ length: 1000 }, () => chooseBotMove(botById('pip'), ctx, rng));
    expect(picks.filter((u) => u !== 'e2e4').length).toBeGreaterThan(400);
    const candidates = new Set(SPREAD.map((l) => l.uci));
    expect(picks.some((u) => !candidates.has(u))).toBe(true);
  });

  it('makes stronger bots more accurate than weaker ones', () => {
    const bestRate = (id: string) => {
      const rng = createRng(11);
      return Array.from({ length: 500 }, () => chooseBotMove(botById(id), ctx, rng)).filter(
        (u) => u === 'e2e4',
      ).length;
    };
    expect(bestRate('maya')).toBeGreaterThan(bestRate('pip'));
  });

  it('brings the queen out early for the queen-loving bot', () => {
    const fen = new Chess(START);
    fen.move('e4');
    fen.move('e5');
    const position = fen.fen();
    const lines = [line('g1f3', 40), line('d1h5', -60), line('b1c3', 20)];
    const bot = BOTS.find((b) => b.rating === 1300);
    const rng = createRng(3);
    const picks = Array.from({ length: 200 }, () =>
      chooseBotMove(bot!, { fen: position, ply: 3, lines, legalUci: legalUci(position) }, rng),
    );
    expect(picks.filter((u) => u === 'd1h5').length).toBeGreaterThan(140);
  });

  it('returns a legal move even when the engine gave no lines', () => {
    const rng = createRng(5);
    const move = chooseBotMove(botById('maya'), { ...ctx, lines: [] }, rng);
    expect(ctx.legalUci).toContain(move);
  });

  it("plays Stockfish's strength-limited bestmove for UCI_Elo bots", () => {
    const rng = createRng(12);
    const move = chooseBotMove(botById('elena'), { ...ctx, engineMove: 'g1f3' }, rng);
    expect(move).toBe('g1f3'); // not lines[0] (e2e4)
  });

  it('ignores an illegal engine bestmove', () => {
    const rng = createRng(12);
    expect(chooseBotMove(botById('elena'), { ...ctx, engineMove: 'e2e5' }, rng)).toBe('e2e4');
  });

  it('throws a clear error when the position has no legal moves', () => {
    const rng = createRng(1);
    expect(() =>
      chooseBotMove(
        botById('pip'),
        { fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', ply: 40, lines: [], legalUci: [] },
        rng,
      ),
    ).toThrow(/no legal moves/i);
  });

  it('ignores engine lines that are not legal in the position', () => {
    const rng = createRng(9);
    const move = chooseBotMove(
      botById('engine-max'),
      { ...ctx, lines: [line('e2e5', 900), line('d2d4', 10)] },
      rng,
    );
    expect(move).toBe('d2d4');
  });
});

describe('botLine', () => {
  it('always speaks at the start and end of a game', () => {
    const rng = createRng(2);
    for (const bot of BOTS) {
      expect(botLine(bot, 'game-start', 'en', rng)).toBeTruthy();
      expect(botLine(bot, 'win', 'hinglish', rng)).toBeTruthy();
    }
  });

  it('is deterministic for a seed and stays quiet sometimes on optional events', () => {
    const say = (seed: number) => {
      const rng = createRng(seed);
      return Array.from({ length: 50 }, () => botLine(botById('maya'), 'in-check', 'en', rng));
    };
    expect(say(4)).toEqual(say(4));
    expect(say(4).some((l) => l === null)).toBe(true);
  });
});
