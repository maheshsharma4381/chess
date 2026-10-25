import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { UciEngine } from '../src/UciEngine';
import { stockfishProcessCommand } from '../src/node';
import { createProcessTransport } from '../src/transports/process';

const require = createRequire(import.meta.url);
// The stockfish npm CLI speaks UCI on stdin/stdout like a native binary would.
const CLI = join(dirname(require.resolve('stockfish/package.json')), 'scripts', 'cli.js');

describe('createProcessTransport', () => {
  it('drives a UCI engine process to a legal best move', { timeout: 60_000 }, async () => {
    const engine = new UciEngine(createProcessTransport(process.execPath, [CLI]), {
      readyTimeoutMs: 30_000,
    });
    try {
      await engine.init();
      const { bestmove } = await engine.bestMove(new Chess().fen(), { depth: 6 });
      const legal = new Chess().moves({ verbose: true }).map((m) => m.lan);
      expect(legal).toContain(bestmove);
      const lines = await engine.analyse(new Chess().fen(), { depth: 6, multiPv: 2 });
      expect(lines).toHaveLength(2);
    } finally {
      engine.quit();
    }
  });

  it('runs the bundled engine file directly as a process', { timeout: 60_000 }, async () => {
    const { command, args } = stockfishProcessCommand();
    expect(args[0]).toMatch(/stockfish-19-lite-single\.js$/);
    const engine = new UciEngine(createProcessTransport(command, args), { readyTimeoutMs: 30_000 });
    try {
      const lines = await engine.analyse(new Chess().fen(), { depth: 6, multiPv: 1 });
      expect(lines).toHaveLength(1);
    } finally {
      engine.quit();
    }
  });

  it('reports a process that dies as a crashed engine', { timeout: 30_000 }, async () => {
    const engine = new UciEngine(
      createProcessTransport(process.execPath, ['-e', 'process.exit(3)']),
      { readyTimeoutMs: 10_000 },
    );
    await expect(engine.init()).rejects.toThrow(/crashed.*exited with code 3/i);
  });

  it('reports a binary that cannot start', { timeout: 30_000 }, async () => {
    const engine = new UciEngine(createProcessTransport('definitely-not-a-stockfish-binary'), {
      readyTimeoutMs: 10_000,
    });
    await expect(engine.init()).rejects.toThrow(/crashed/i);
  });
});
