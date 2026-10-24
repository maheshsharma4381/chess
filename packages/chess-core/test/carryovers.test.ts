import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { EngineLine, Motif, MoveReview } from '@chess/types';
import {
  AbortError,
  ExplorerError,
  OpeningExplorerService,
  OpeningLookupService,
  analyzeGame,
  detectMotifs,
  explainMove,
  loadEcoBook,
  parsePgn,
  type EngineAdapter,
} from '../src/index';

const book = new OpeningLookupService(loadEcoBook());

class CountingEngine implements EngineAdapter {
  calls = 0;
  constructor(private readonly onCall: (n: number) => EngineLine[] | void = () => {}) {}
  async analyse(fen: string): Promise<EngineLine[]> {
    this.calls++;
    const scripted = this.onCall(this.calls);
    if (scripted) return scripted;
    const first = new Chess(fen).moves({ verbose: true })[0];
    return first ? [{ uci: first.lan, pv: [first.lan], score: { cp: 0 }, depth: 10 }] : [];
  }
}

describe('parsePgn robustness', () => {
  it('keeps header values that contain brackets out of the movetext', () => {
    expect(parsePgn('[Event "Arena [Nov]"]\n[Site "x"]\n\n1. e4 e5 *').sans).toEqual(['e4', 'e5']);
  });

  it('reads only the first game of a multi-game paste', () => {
    const pgn = '[Event "One"]\n\n1. e4 e5 2. Nf3 Nc6 1-0\n\n[Event "Two"]\n\n1. d4 d5 0-1';
    expect(parsePgn(pgn).sans).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });
});

describe('analyzeGame cancellation and engine errors', () => {
  it('stops and rejects with AbortError when the signal aborts', async () => {
    const controller = new AbortController();
    const engine = new CountingEngine((n) => {
      if (n === 2) controller.abort();
    });
    const run = analyzeGame(
      { pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6' },
      { engine, book },
      { signal: controller.signal },
    );
    await expect(run).rejects.toBeInstanceOf(AbortError);
    expect(engine.calls).toBe(2);
  });

  it('rejects immediately for an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const engine = new CountingEngine();
    await expect(
      analyzeGame({ pgn: '1. e4' }, { engine, book }, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(AbortError);
    expect(engine.calls).toBe(0);
  });

  it('treats an empty engine answer for a live position as an adapter bug', async () => {
    const engine = new CountingEngine(() => []);
    await expect(analyzeGame({ pgn: '1. e4' }, { engine, book })).rejects.toThrow(
      /engine returned no lines/i,
    );
  });
});

describe('explorer cancellation and timeout', () => {
  const hanging: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted by signal')));
    });
  const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

  it('rejects with AbortError when the caller aborts', async () => {
    const controller = new AbortController();
    const run = new OpeningExplorerService({ fetchFn: hanging }).query(FEN, {
      source: 'masters',
      signal: controller.signal,
    });
    controller.abort();
    await expect(run).rejects.toBeInstanceOf(AbortError);
  });

  it('times out with an ExplorerError', async () => {
    const err = await new OpeningExplorerService({ fetchFn: hanging, timeoutMs: 20 })
      .query(FEN, { source: 'masters' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExplorerError);
    expect((err as ExplorerError).message).toMatch(/timed out/i);
    expect((err as ExplorerError).status).toBeNull();
  });
});

const review = (overrides: Partial<MoveReview>): MoveReview => ({
  ply: 15,
  color: 'white',
  san: 'Bb5',
  uci: 'f1b5',
  fenBefore: '',
  fenAfter: '',
  classification: 'mistake',
  accuracy: 50,
  winBefore: 55,
  winAfter: 40,
  scoreBefore: { cp: 30 },
  scoreAfter: { cp: -80 },
  bestMove: { uci: 'e1g1', san: 'O-O' },
  secondBestMove: null,
  pv: [],
  isBook: false,
  phase: 'middlegame',
  motifs: [],
  ...overrides,
});

describe('coach wording', () => {
  it('says "theory continues" rather than claiming a main line', () => {
    const deviation: Motif = {
      type: 'book-deviation',
      squares: [],
      detail: { eco: 'C50', name: 'Italian Game', bestBookSan: 'Nh6' },
    };
    const text = explainMove(
      review({ classification: 'inaccuracy', motifs: [deviation] }),
      'en',
    ).text;
    expect(text).toContain('theory continues Nh6');
    expect(text).not.toMatch(/main line/i);
  });

  it('joins fork targets with "aur" in Hinglish', () => {
    const fork: Motif = {
      type: 'fork',
      squares: ['c7', 'e8', 'a8'],
      detail: {
        piece: 'knight',
        targets: 'king and rook',
        targetList: 'king,rook',
        source: 'reply',
      },
    };
    const text = explainMove(review({ motifs: [fork] }), 'hinglish').text;
    expect(text).toContain('king aur rook');
    expect(text).not.toContain(' and ');
  });

  it("does not blame a bad move on the mover's own pin", () => {
    const pin: Motif = {
      type: 'pin',
      squares: ['b5', 'c6', 'e8'],
      detail: { piece: 'knight', behind: 'king', source: 'played' },
    };
    expect(explainMove(review({ motifs: [pin] }), 'en').text).not.toMatch(/pinned/);
  });
});

describe('motif detector fixes', () => {
  it('does not treat the castling rook as a discovered attack', () => {
    const motifs = detectMotifs({
      // After O-O the f1 rook sees the loose bishop on f5; the rook arrived, it discovered nothing.
      fenBefore: '7k/8/8/5b2/8/8/8/4K2R w K - 0 1',
      uci: 'e1g1',
      ply: 30,
      bestLine: [],
      replyLine: [],
      scoreAfter: { cp: 0 },
      isBook: false,
      bookOpening: null,
      deviation: null,
      sacrifice: false,
    });
    expect(motifs.map((m) => m.type)).not.toContain('discovered-attack');
  });

  it('uses the FEN fullmove number for opening-only notes', () => {
    const motifs = detectMotifs({
      fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 25',
      uci: 'g1f3',
      ply: 1,
      bestLine: [],
      replyLine: [],
      scoreAfter: { cp: 0 },
      isBook: false,
      bookOpening: null,
      deviation: null,
      sacrifice: false,
    });
    expect(motifs.map((m) => m.type)).not.toContain('development');
  });
});

describe('package entry points', () => {
  it('declares itself side-effect free and exposes a separate book entry', () => {
    const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'));
    expect(pkg.sideEffects).toBe(false);
    expect(pkg.exports['./book']).toBe('./src/book.ts');
  });
});
