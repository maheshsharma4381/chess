import { describe, expect, it } from 'vitest';
import { AbortError } from '@chess/chess-core';
import { EngineError, UciEngine, type UciTransport } from '../src/index';

/** Replies to each command with scripted lines, asynchronously like a real worker. */
class ScriptedTransport implements UciTransport {
  sent: string[] = [];
  private lineCb: (line: string) => void = () => {};
  private errorCb: (err: Error) => void = () => {};
  terminated = false;

  constructor(
    private readonly script: (cmd: string, t: ScriptedTransport) => string[] = defaultScript,
  ) {}

  send(cmd: string): void {
    this.sent.push(cmd);
    const replies = this.script(cmd, this);
    setTimeout(() => replies.forEach((l) => this.lineCb(l)), 1);
  }
  onLine(cb: (line: string) => void): void {
    this.lineCb = cb;
  }
  onError(cb: (err: Error) => void): void {
    this.errorCb = cb;
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(line: string): void {
    this.lineCb(line);
  }
  crash(): void {
    this.errorCb(new Error('worker died'));
  }
}

function defaultScript(cmd: string): string[] {
  if (cmd === 'uci') return ['id name Fakefish', 'uciok'];
  if (cmd === 'isready') return ['readyok'];
  if (cmd.startsWith('go')) {
    return [
      'info depth 9 multipv 1 score cp 20 pv e2e4 e7e5',
      'info depth 9 multipv 2 score cp 10 pv d2d4',
      'info depth 10 multipv 1 score cp 25 pv e2e4 c7c5',
      'info depth 10 multipv 2 score cp 15 pv d2d4 d7d5',
      'bestmove e2e4 ponder c7c5',
    ];
  }
  return [];
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('UciEngine', () => {
  it('performs the uci / isready handshake once', async () => {
    const t = new ScriptedTransport();
    const engine = new UciEngine(t);
    await engine.init();
    await engine.init();
    expect(t.sent).toEqual(['uci', 'isready']);
  });

  it('returns the deepest line per MultiPV slot, side-to-move POV', async () => {
    const t = new ScriptedTransport();
    const lines = await new UciEngine(t).analyse(START, { depth: 10, multiPv: 2 });
    expect(lines).toEqual([
      { uci: 'e2e4', pv: ['e2e4', 'c7c5'], score: { cp: 25 }, depth: 10 },
      { uci: 'd2d4', pv: ['d2d4', 'd7d5'], score: { cp: 15 }, depth: 10 },
    ]);
    expect(t.sent).toContain('setoption name MultiPV value 2');
    expect(t.sent).toContain(`position fen ${START}`);
    expect(t.sent).toContain('go depth 10');
  });

  it('queues concurrent searches instead of interleaving them', async () => {
    const t = new ScriptedTransport();
    const engine = new UciEngine(t);
    const first = engine.analyse(START, { depth: 10, multiPv: 1 });
    const second = engine.analyse(START, { depth: 12, multiPv: 1 });
    await first;
    const goes = () => t.sent.filter((c) => c.startsWith('go'));
    expect(goes()).toEqual(['go depth 10']);
    await second;
    expect(goes()).toEqual(['go depth 10', 'go depth 12']);
  });

  it('stops an aborted search and never leaks its lines into the next one', async () => {
    let searches = 0;
    const controller = new AbortController();
    const t = new ScriptedTransport((cmd) => {
      if (cmd === 'uci') return ['uciok'];
      if (cmd === 'isready') return ['readyok'];
      if (cmd.startsWith('go')) {
        searches++;
        if (searches === 1) {
          setTimeout(() => controller.abort(), 5); // the user gives up mid-search
          return ['info depth 5 multipv 1 score cp 999 pv a2a3']; // still thinking
        }
        return ['info depth 8 multipv 1 score cp 7 pv g1f3', 'bestmove g1f3'];
      }
      if (cmd === 'stop') return ['info depth 6 multipv 1 score cp 998 pv a2a3', 'bestmove a2a3'];
      return [];
    });
    const engine = new UciEngine(t);
    const aborted = engine.analyse(START, { depth: 30, multiPv: 1, signal: controller.signal });
    await expect(aborted).rejects.toBeInstanceOf(AbortError);
    expect(t.sent).toContain('stop');

    const next = await engine.analyse(START, { depth: 8, multiPv: 1 });
    expect(next).toEqual([{ uci: 'g1f3', pv: ['g1f3'], score: { cp: 7 }, depth: 8 }]);
  });

  it('rejects with a timeout when the engine never becomes ready', async () => {
    const t = new ScriptedTransport((cmd) => (cmd === 'uci' ? ['uciok'] : []));
    const err = await new UciEngine(t, { readyTimeoutMs: 30 })
      .analyse(START, { depth: 5, multiPv: 1 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).kind).toBe('timeout');
  });

  it('rejects pending and later calls after the transport crashes', async () => {
    const t = new ScriptedTransport((cmd) =>
      cmd === 'uci' ? ['uciok'] : cmd === 'isready' ? ['readyok'] : [],
    );
    const engine = new UciEngine(t);
    const pending = engine.analyse(START, { depth: 20, multiPv: 1 });
    setTimeout(() => t.crash(), 20);
    const err = await pending.catch((e: unknown) => e);
    expect((err as EngineError).kind).toBe('crashed');
    const later = await engine.analyse(START, { depth: 1, multiPv: 1 }).catch((e: unknown) => e);
    expect((later as EngineError).kind).toBe('crashed');
  });

  it('limits strength for bot moves and restores full strength for analysis', async () => {
    const t = new ScriptedTransport();
    const engine = new UciEngine(t);
    const result = await engine.bestMove(START, { elo: 1500, movetime: 300 });
    expect(result.bestmove).toBe('e2e4');
    expect(t.sent).toContain('setoption name UCI_LimitStrength value true');
    expect(t.sent).toContain('setoption name UCI_Elo value 1500');
    expect(t.sent).toContain('go movetime 300');

    await engine.analyse(START, { depth: 10, multiPv: 1 });
    expect(t.sent).toContain('setoption name UCI_LimitStrength value false');
  });

  it('does not resend options that are already set', async () => {
    const t = new ScriptedTransport();
    const engine = new UciEngine(t);
    await engine.analyse(START, { depth: 10, multiPv: 3 });
    await engine.analyse(START, { depth: 10, multiPv: 3 });
    expect(t.sent.filter((c) => c === 'setoption name MultiPV value 3')).toHaveLength(1);
  });

  it('terminates the transport on quit', async () => {
    const t = new ScriptedTransport();
    const engine = new UciEngine(t);
    await engine.init();
    engine.quit();
    expect(t.sent.at(-1)).toBe('quit');
    expect(t.terminated).toBe(true);
  });
});
