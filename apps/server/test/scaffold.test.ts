import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import express from 'express';
import { io as connect } from 'socket.io-client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { HttpError } from '../src/http/errors';
import { createLogger } from '../src/logger';
import { attachSocket } from '../src/realtime';

const SECRET = 'x'.repeat(32);
const envFile = (content: string) => {
  const file = join(mkdtempSync(join(tmpdir(), 'chess-server-env-')), '.env');
  writeFileSync(file, content);
  return file;
};

describe('loadConfig', () => {
  it('reads the lowercase database_url key from the repo .env', () => {
    const file = envFile(
      `database_url="postgresql://u:p@h:5432/postgres"\nAUTH_SECRET=${SECRET}\n`,
    );
    const config = loadConfig({}, [file]);
    expect(config.databaseUrl).toBe('postgresql://u:p@h:5432/postgres');
    expect(config.dbSchema).toBe('chess');
    expect(config.port).toBe(4000);
    expect(config.redisUrl).toBe('redis://127.0.0.1:6379');
    expect(config.google).toBeNull();
    expect(config.production).toBe(false);
  });

  it('lets the process environment override the files', () => {
    const file = envFile(`DATABASE_URL=postgresql://file/db\nAUTH_SECRET=${SECRET}\nPORT=1\n`);
    const config = loadConfig({ DATABASE_URL: 'postgresql://env/db', PORT: '4100' }, [file]);
    expect(config.databaseUrl).toBe('postgresql://env/db');
    expect(config.port).toBe(4100);
  });

  it('rejects a short AUTH_SECRET and a bad schema name, naming the key', () => {
    expect(() =>
      loadConfig({ DATABASE_URL: 'postgresql://h/db', AUTH_SECRET: 'short' }, []),
    ).toThrow(/AUTH_SECRET/);
    expect(() =>
      loadConfig(
        { DATABASE_URL: 'postgresql://h/db', AUTH_SECRET: SECRET, DB_SCHEMA: 'x;drop' },
        [],
      ),
    ).toThrow(/DB_SCHEMA/);
  });

  it('enables Google only when both id and secret are set', () => {
    const base = { DATABASE_URL: 'postgresql://h/db', AUTH_SECRET: SECRET };
    expect(loadConfig({ ...base, GOOGLE_CLIENT_ID: 'id' }, []).google).toBeNull();
    expect(
      loadConfig({ ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' }, []).google,
    ).toEqual({
      clientId: 'id',
      clientSecret: 's',
      redirectUri: 'http://localhost:3000/api/v1/auth/google/callback',
    });
  });
});

function captureLogs() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      for (const line of String(chunk).split('\n').filter(Boolean)) lines.push(JSON.parse(line));
      done();
    },
  });
  return { lines, logger: createLogger({ level: 'info', stream }) };
}

const config = loadConfig({ DATABASE_URL: 'postgresql://h/db', AUTH_SECRET: SECRET }, []);
const healthy = { db: async () => {}, redis: async () => {} };

describe('createApp', () => {
  it('answers /health and /ready', async () => {
    const { logger } = captureLogs();
    const app = createApp({ config, logger, health: healthy });
    await request(app).get('/health').expect(200, { status: 'ok' });
    await request(app)
      .get('/ready')
      .expect(200, { status: 'ready', checks: { db: true, redis: true } });
  });

  it('reports 503 with the failing check when a dependency is down', async () => {
    const { logger } = captureLogs();
    const app = createApp({
      config,
      logger,
      health: { db: async () => Promise.reject(new Error('db down')), redis: async () => {} },
    });
    await request(app)
      .get('/ready')
      .expect(503, { status: 'unavailable', checks: { db: false, redis: true } });
  });

  it('turns errors into JSON without leaking internals', async () => {
    const { logger, lines } = captureLogs();
    const router = express.Router();
    router.get('/teapot', () => {
      throw new HttpError(418, 'I am a teapot');
    });
    router.get('/boom', async () => {
      throw new Error('secret internal detail');
    });
    const app = createApp({ config, logger, health: healthy, routers: [router] });
    await request(app).get('/nope').expect(404, { error: 'Not found' });
    await request(app).get('/teapot').expect(418, { error: 'I am a teapot' });
    const boom = await request(app).get('/boom').expect(500);
    expect(boom.body).toEqual({ error: 'Internal error' });
    expect(JSON.stringify(boom.body)).not.toContain('secret internal detail');
    expect(
      lines.some((l) => l['level'] === 50 && JSON.stringify(l).includes('secret internal detail')),
    ).toBe(true);
  });

  it('rejects malformed JSON with 400', async () => {
    const { logger } = captureLogs();
    const router = express.Router();
    router.post('/echo', (req, res) => {
      res.json(req.body);
    });
    const app = createApp({ config, logger, health: healthy, routers: [router] });
    await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{bad json')
      .expect(400, { error: 'Malformed JSON body' });
  });

  it('sends security headers and no x-powered-by', async () => {
    const { logger } = captureLogs();
    const res = await request(createApp({ config, logger, health: healthy })).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('logger', () => {
  it('redacts credentials in logged objects', () => {
    const { logger, lines } = captureLogs();
    logger.info(
      {
        req: { headers: { authorization: 'Bearer abc', cookie: 'chess_access=abc' } },
        body: { password: 'hunter22', refreshToken: 'rt' },
      },
      'request',
    );
    const text = JSON.stringify(lines);
    expect(text).not.toContain('abc');
    expect(text).not.toContain('hunter22');
    expect(text).not.toContain('"rt"');
    expect(text).toContain('[redacted]');
  });
});

describe('attachSocket', () => {
  it('answers ping with pong', async () => {
    const { logger } = captureLogs();
    const server = createServer();
    const io = attachSocket(server, { logger });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const client = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
    try {
      const reply = await client.timeout(5000).emitWithAck('ping');
      expect(reply).toBe('pong');
    } finally {
      client.close();
      await io.close();
    }
  });
});
