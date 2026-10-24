import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { EngineLine, Score } from '@chess/types';
import {
  OpeningLookupService,
  analyzeGame,
  loadEcoBook,
  normalizeEpd,
  type EngineAdapter,
} from '../src/index';

const book = new OpeningLookupService(loadEcoBook());

/** Scripted engine: side-to-move scores per position; unknown positions get the first legal move at 0.00. */
class FakeEngine implements EngineAdapter {
  calls: string[] = [];
  constructor(private readonly table: Record<string, Array<{ uci: string; score: Score }>> = {}) {}

  async analyse(fen: string): Promise<EngineLine[]> {
    this.calls.push(fen);
    const scripted = this.table[normalizeEpd(fen)];
    if (scripted)
      return scripted.map((l) => ({ uci: l.uci, pv: [l.uci], score: l.score, depth: 18 }));
    const first = new Chess(fen).moves({ verbose: true })[0];
    return first ? [{ uci: first.lan, pv: [first.lan], score: { cp: 0 }, depth: 18 }] : [];
  }
}

const epdAfter = (sans: string) => {
  const chess = new Chess();
  for (const san of sans.split(' ')) chess.move(san);
  return normalizeEpd(chess.fen());
};

const SCHOLARS = '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#';
const scholarsEngine = () =>
  new FakeEngine({
    // Black to move after 3.Qh5: black-POV scores.
    [epdAfter('e4 e5 Bc4 Nc6 Qh5')]: [
      { uci: 'g7g6', score: { cp: -20 } },
      { uci: 'd8e7', score: { cp: -35 } },
    ],
    // White to move after 3...Nf6??: mate in 1.
    [epdAfter('e4 e5 Bc4 Nc6 Qh5 Nf6')]: [{ uci: 'h5f7', score: { mate: 1 } }],
  });

describe('analyzeGame', () => {
  it("reviews Scholar's mate: book start, Nf6 blunder, Qxf7# best", async () => {
    const report = await analyzeGame({ pgn: SCHOLARS }, { engine: scholarsEngine(), book });
    expect(report.moves.map((m) => m.san)).toEqual([
      'e4',
      'e5',
      'Bc4',
      'Nc6',
      'Qh5',
      'Nf6',
      'Qxf7#',
    ]);
    expect(report.moves.slice(0, 5).every((m) => m.classification === 'book')).toBe(true);
    expect(report.moves[5]).toMatchObject({
      classification: 'blunder',
      color: 'black',
      isBook: false,
    });
    expect(report.moves[6]).toMatchObject({
      classification: 'best',
      bestMove: { uci: 'h5f7', san: 'Qxf7#' },
    });
    expect(report.winGraph).toHaveLength(8);
    expect(report.winGraph.at(-1)).toBe(100);
    expect(report.opening).toMatchObject({ eco: 'C23', name: "Bishop's Opening", lastBookPly: 5 });
  });

  it('converts side-to-move engine scores to White POV', async () => {
    const report = await analyzeGame({ pgn: SCHOLARS }, { engine: scholarsEngine(), book });
    // Before 3...Nf6 the engine said -20 for Black-to-move, i.e. +20 for White.
    expect(report.moves[5]?.scoreBefore).toEqual({ cp: 20 });
    expect(report.moves[5]?.scoreAfter).toEqual({ mate: 1 });
    expect(report.moves[5]?.secondBestMove).toEqual({ uci: 'd8e7', san: 'Qe7' });
  });

  it('marks the deviation from book on the move that left theory', async () => {
    const report = await analyzeGame({ pgn: SCHOLARS }, { engine: scholarsEngine(), book });
    expect(report.moves[5]?.motifs.map((m) => m.type)).toContain('book-deviation');
  });

  it('calls the engine once per non-terminal position and reports progress', async () => {
    const engine = scholarsEngine();
    const progress: Array<[number, number]> = [];
    await analyzeGame(
      { pgn: SCHOLARS },
      { engine, book },
      { onProgress: (done, total) => progress.push([done, total]) },
    );
    expect(engine.calls).toHaveLength(7); // 8 positions, the final mate is not analysed
    expect(progress).toHaveLength(8);
    expect(progress.at(-1)).toEqual([8, 8]);
  });

  it('counts classifications and fills accuracy and rating per color', async () => {
    const report = await analyzeGame(
      { pgn: SCHOLARS },
      { engine: scholarsEngine(), book },
      { baseElo: { white: 1200 } },
    );
    expect(report.counts.white.book).toBe(3);
    expect(report.counts.black.blunder).toBe(1);
    const total = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);
    expect(total(report.counts.white) + total(report.counts.black)).toBe(7);
    expect(report.accuracy.white).toBeGreaterThan(report.accuracy.black);
    expect(report.phaseAccuracy.white.opening).not.toBeNull();
  });

  it('withholds the estimated rating when a side made too few non-book moves', async () => {
    const report = await analyzeGame({ pgn: SCHOLARS }, { engine: scholarsEngine(), book });
    expect(report.estimatedRating).toEqual({ white: null, black: null });
  });

  it('estimates a rating once each side has enough non-book moves', async () => {
    const sans = Array.from({ length: 5 }, () => ['Ra2', 'Kd8', 'Ra1', 'Ke8']).flat();
    const report = await analyzeGame(
      { sans, startFen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1' },
      { engine: new FakeEngine(), book },
      { baseElo: { white: 1200 } },
    );
    expect(report.estimatedRating.white).toBeGreaterThan(1200);
    expect(report.estimatedRating.black).not.toBeNull();
  });

  it("does not let book trap lines hide Fool's Mate", async () => {
    const engine = new FakeEngine({
      // Black to move after 2.g4: mate in 1 for Black (side-to-move POV).
      [epdAfter('f3 e5 g4')]: [{ uci: 'd8h4', score: { mate: 1 } }],
    });
    const report = await analyzeGame({ pgn: '1. f3 e5 2. g4 Qh4#' }, { engine, book });
    expect(report.moves[2]).toMatchObject({ san: 'g4', classification: 'blunder' });
    // Spec formula for a 50 -> 0 win% drop: 103.1668 * e^(-0.04354 * 50) - 3.1669.
    expect(report.moves[2]?.accuracy).toBeCloseTo(8.53, 1);
    expect(report.accuracy.white).toBeLessThan(report.accuracy.black);
  });

  it('yields to the event loop while reviewing, so UIs and servers stay responsive', async () => {
    let timerFired = false;
    setTimeout(() => {
      timerFired = true;
    }, 0);
    await analyzeGame({ pgn: SCHOLARS }, { engine: scholarsEngine(), book });
    expect(timerFired).toBe(true);
  });

  it('scores a stalemate as a draw without asking the engine', async () => {
    const engine = new FakeEngine();
    const report = await analyzeGame(
      { sans: ['Qc7'], startFen: 'k7/8/1Q6/8/8/8/8/7K w - - 0 1' },
      { engine, book },
    );
    expect(engine.calls).toHaveLength(1);
    expect(report.moves[0]?.scoreAfter).toEqual({ cp: 0 });
  });

  it('accepts PGN with headers, comments, variations and NAGs', async () => {
    const pgn = `[Event "Test"]\n[White "A"]\n\n1. e4 {best by test} e5 (1... c5 2. Nf3) 2. Nf3 $1 Nc6 *`;
    const report = await analyzeGame({ pgn }, { engine: new FakeEngine(), book });
    expect(report.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('starts from a FEN header', async () => {
    const pgn = `[SetUp "1"]\n[FEN "k7/8/1Q6/8/8/8/8/7K w - - 0 1"]\n\n1. Qc7 1/2-1/2`;
    const report = await analyzeGame({ pgn }, { engine: new FakeEngine(), book });
    expect(report.moves[0]?.fenBefore).toBe('k7/8/1Q6/8/8/8/8/7K w - - 0 1');
    expect(report.startFen).toBe('k7/8/1Q6/8/8/8/8/7K w - - 0 1');
  });

  it('reports the start position even for a game without moves', async () => {
    const pgn = `[SetUp "1"]\n[FEN "k7/8/1Q6/8/8/8/8/7K w - - 0 1"]\n\n*`;
    const report = await analyzeGame({ pgn }, { engine: new FakeEngine(), book });
    expect(report.startFen).toBe('k7/8/1Q6/8/8/8/8/7K w - - 0 1');
  });

  it('rejects an illegal move with a message naming it', async () => {
    await expect(
      analyzeGame({ pgn: '1. e4 e5 2. Nf9' }, { engine: new FakeEngine(), book }),
    ).rejects.toThrow(/Illegal move "Nf9" at ply 3/);
  });

  it('handles an empty game', async () => {
    const report = await analyzeGame({ pgn: '' }, { engine: new FakeEngine(), book });
    expect(report.moves).toEqual([]);
    expect(report.accuracy).toEqual({ white: 100, black: 100 });
    expect(report.winGraph).toHaveLength(1);
  });
});
