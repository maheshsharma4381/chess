import { describe, expect, it } from 'vitest';
import { EngineError, UciEngine, type UciTransport } from '../src/index';

/** Handshakes, then never answers a search. */
function hangingSearch(): UciTransport {
  let cb: (line: string) => void = () => {};
  return {
    send(cmd) {
      const reply = cmd === 'uci' ? 'uciok' : cmd === 'isready' ? 'readyok' : null;
      if (reply) setTimeout(() => cb(reply), 1);
    },
    onLine(fn) {
      cb = fn;
    },
    terminate() {},
  };
}

describe('search timeouts', () => {
  it('gives up on a timed bot move shortly after its movetime, not after the 2-minute default', async () => {
    const engine = new UciEngine(hangingSearch(), { searchGraceMs: 40 });
    const started = Date.now();
    const err = await engine
      .bestMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { movetime: 50 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).kind).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
