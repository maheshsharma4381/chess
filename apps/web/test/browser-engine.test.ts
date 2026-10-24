import { describe, expect, it } from 'vitest';
import { createEngineStore } from '@/lib/engine/browserEngine';

/** A Worker stand-in that answers the UCI handshake like Stockfish. */
class HandshakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message?: string }) => void) | null = null;
  terminated = false;
  constructor(public url: string) {}
  postMessage(cmd: string) {
    const reply = cmd === 'uci' ? 'uciok' : cmd === 'isready' ? 'readyok' : null;
    if (reply) setTimeout(() => this.onmessage?.({ data: reply }), 1);
  }
  terminate() {
    this.terminated = true;
  }
}

describe('browser engine store', () => {
  it('starts idle and becomes ready after the UCI handshake', async () => {
    let created: HandshakeWorker | null = null;
    const store = createEngineStore({
      createWorker: (url) => (created = new HandshakeWorker(url)),
    });
    expect(store.getState().status).toBe('idle');
    const engine = await store.getState().getEngine();
    expect(engine).toBeTruthy();
    expect(store.getState().status).toBe('ready');
    expect(created!.url).toBe('/engine/stockfish-19-lite-single.js');
  });

  it('reuses one engine for concurrent callers', async () => {
    let workers = 0;
    const store = createEngineStore({
      createWorker: (url) => {
        workers++;
        return new HandshakeWorker(url);
      },
    });
    const [a, b] = await Promise.all([store.getState().getEngine(), store.getState().getEngine()]);
    expect(a).toBe(b);
    expect(workers).toBe(1);
  });

  it('reports an error when the worker cannot start, and recovers on retry', async () => {
    let fail = true;
    const store = createEngineStore({
      createWorker: (url) => {
        if (fail) throw new Error('WebAssembly is disabled');
        return new HandshakeWorker(url);
      },
    });
    await expect(store.getState().getEngine()).rejects.toThrow(/WebAssembly is disabled/);
    expect(store.getState().status).toBe('error');
    expect(store.getState().error).toMatch(/WebAssembly is disabled/);

    fail = false;
    await store.getState().retry();
    expect(store.getState().status).toBe('ready');
    expect(store.getState().error).toBeNull();
  });

  it('reports an error when the engine never answers', async () => {
    class SilentWorker extends HandshakeWorker {
      override postMessage() {}
    }
    const store = createEngineStore({
      createWorker: (url) => new SilentWorker(url),
      readyTimeoutMs: 30,
    });
    await expect(store.getState().getEngine()).rejects.toThrow(/did not answer/);
    expect(store.getState().status).toBe('error');
  });

  it('flags a worker that crashes after starting', async () => {
    let worker: HandshakeWorker | null = null;
    const store = createEngineStore({ createWorker: (url) => (worker = new HandshakeWorker(url)) });
    await store.getState().getEngine();
    worker!.onerror?.({ message: 'out of memory' });
    expect(store.getState().status).toBe('error');
    expect(store.getState().error).toMatch(/out of memory/);
  });
});
