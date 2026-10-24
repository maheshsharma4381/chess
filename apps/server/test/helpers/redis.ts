import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createServer, connect } from 'node:net';
import { join } from 'node:path';

/** A free TCP port on 127.0.0.1. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/**
 * The redis-server binary: REDIS_SERVER_BIN, then the winget portable build (plan ruling R2),
 * then PATH.
 */
export function findRedisServer(): string {
  if (process.env['REDIS_SERVER_BIN']) return process.env['REDIS_SERVER_BIN'];
  const local = process.env['LOCALAPPDATA'];
  if (local) {
    const packages = join(local, 'Microsoft', 'WinGet', 'Packages');
    if (existsSync(packages)) {
      for (const dir of readdirSync(packages).filter((d) =>
        d.startsWith('taizod1024.redis-windows-fork'),
      )) {
        for (const sub of readdirSync(join(packages, dir))) {
          const bin = join(packages, dir, sub, 'redis-server.exe');
          if (existsSync(bin)) return bin;
        }
      }
    }
  }
  return 'redis-server';
}

/** Answers a RESP PING with +PONG? */
function ping(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1');
    socket.setTimeout(500);
    socket.once('connect', () => socket.write('PING\r\n'));
    socket.once('data', (d) => {
      socket.destroy();
      resolve(String(d).startsWith('+PONG'));
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export interface TestRedis {
  url: string;
  stop(): Promise<void>;
}

/** A throwaway Redis: in-memory only, bound to localhost, on a free port. */
export async function startRedis(): Promise<TestRedis> {
  if (process.env['REDIS_URL']) return { url: process.env['REDIS_URL'], stop: async () => {} };
  const port = await freePort();
  const child: ChildProcess = spawn(
    findRedisServer(),
    [
      '--port',
      String(port),
      '--bind',
      '127.0.0.1',
      '--save',
      '',
      '--appendonly',
      'no',
      '--maxmemory',
      '128mb',
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  const failed = new Promise<never>((_, reject) =>
    child.once('error', (err) => reject(new Error(`Could not start redis-server: ${err.message}`))),
  );
  const deadline = Date.now() + 10_000;
  for (;;) {
    if (await Promise.race([ping(port), failed])) break;
    if (Date.now() > deadline) {
      child.kill();
      throw new Error('redis-server did not answer PING within 10s');
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    url: `redis://127.0.0.1:${port}`,
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        child.kill();
      }),
  };
}
