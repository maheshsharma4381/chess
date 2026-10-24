import { afterAll, describe, expect, it } from 'vitest';
import { OpeningLookupService, analyzeGame, loadEcoBook } from '@chess/chess-core';
import { createNodeStockfish } from '../src/node';

// Real Stockfish 19 lite (WASM) running in Node: proves the protocol layer against the
// actual engine, and Game Review on a real game.
const engine = createNodeStockfish();
afterAll(() => engine.quit());

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('Stockfish 19 lite (real engine)', { timeout: 120_000 }, () => {
  it('returns three ranked lines for the start position', async () => {
    const lines = await engine.analyse(START, { depth: 10, multiPv: 3 });
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.depth === 10 && l.pv.length > 0)).toBe(true);
  });

  it('finds a mate in one with a mate score', async () => {
    // Scholar's mate after 3...Nf6??: Qxf7#.
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    const [best] = await engine.analyse(fen, { depth: 8, multiPv: 1 });
    expect(best).toMatchObject({ uci: 'h5f7', score: { mate: 1 } });
  });

  it("reviews Scholar's mate correctly end to end", async () => {
    const book = new OpeningLookupService(loadEcoBook());
    const report = await analyzeGame(
      { pgn: '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#' },
      { engine, book },
      { depth: 10 },
    );
    expect(report.moves[5]).toMatchObject({ san: 'Nf6', classification: 'blunder' });
    expect(['best', 'great']).toContain(report.moves[6]?.classification);
    expect(report.winGraph.at(-1)).toBe(100);
  });
});
