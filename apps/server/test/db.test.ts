import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isUniqueViolation } from '../src/db';
import { freePort } from './helpers/redis';
import { startTestDb, type TestDb } from './helpers/db';

let t: TestDb;
beforeAll(async () => {
  t = await startTestDb();
});
afterAll(() => t.stop());
beforeEach(() => t.reset());

const user = (n = 1) => ({
  email: `p${n}@example.com`,
  username: `player${n}`,
  displayName: `Player ${n}`,
});

describe('schema', () => {
  it('creates and reads every model', async () => {
    const u = await t.prisma.user.create({ data: user() });
    expect(u.avatar).toBe('avatar-01');
    expect(u.settings).toEqual({});
    await t.prisma.session.create({
      data: {
        userId: u.id,
        family: 'f1',
        refreshHash: 'h1',
        expiresAt: new Date(Date.now() + 1000),
      },
    });
    await t.prisma.rating.create({ data: { userId: u.id, pool: 'blitz' } });
    await t.prisma.ratingEvent.create({
      data: { userId: u.id, pool: 'blitz', rating: 1500, rd: 350 },
    });
    const game = await t.prisma.game.create({
      data: {
        userId: u.id,
        clientGameId: 'c1',
        whiteName: 'Player 1',
        blackName: 'Pip',
        pgn: '1. e4 *',
        result: '*',
        termination: 'resign',
        plies: 1,
        reviewKey: 'k',
      },
    });
    await t.prisma.reviewReport.create({ data: { key: 'k', depth: 14, report: { moves: [] } } });

    const loaded = await t.prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      include: { sessions: true, ratings: true, ratingEvents: true, games: true },
    });
    expect(loaded.sessions).toHaveLength(1);
    expect(loaded.ratings[0]).toMatchObject({
      pool: 'blitz',
      rating: 1500,
      rd: 350,
      volatility: 0.06,
      games: 0,
    });
    expect(loaded.games[0]?.id).toBe(game.id);
    expect(await t.prisma.reviewReport.count()).toBe(1);
  });

  it('enforces unique emails and one copy per client game id', async () => {
    const u = await t.prisma.user.create({ data: user() });
    const dupEmail = await t.prisma.user
      .create({ data: { ...user(2), email: 'p1@example.com' } })
      .catch((e) => e);
    expect(isUniqueViolation(dupEmail)).toBe(true);

    const game = {
      userId: u.id,
      clientGameId: 'same',
      whiteName: 'a',
      blackName: 'b',
      pgn: '*',
      result: '*',
      termination: 'resign',
      plies: 0,
      reviewKey: 'k',
    };
    await t.prisma.game.create({ data: game });
    expect(isUniqueViolation(await t.prisma.game.create({ data: game }).catch((e) => e))).toBe(
      true,
    );
  });

  it('cascades a user delete to sessions and ratings, keeping saved games', async () => {
    const u = await t.prisma.user.create({ data: user() });
    await t.prisma.rating.create({ data: { userId: u.id, pool: 'rapid' } });
    await t.prisma.game.create({
      data: {
        userId: u.id,
        whiteName: 'a',
        blackName: 'b',
        pgn: '*',
        result: '*',
        termination: 'x',
        plies: 0,
        reviewKey: 'k',
      },
    });
    await t.prisma.user.delete({ where: { id: u.id } });
    expect(await t.prisma.rating.count()).toBe(0);
    const games = await t.prisma.game.findMany();
    expect(games).toHaveLength(1);
    expect(games[0]?.userId).toBeNull();
  });

  it('reset() empties the tables', async () => {
    await t.prisma.user.create({ data: user() });
    await t.reset();
    expect(await t.prisma.user.count()).toBe(0);
  });
});

// The real `prisma migrate deploy` (what production runs) against a fresh PGlite. It shells
// out to the Prisma CLI, so it is slow; async exec keeps the in-process server responsive.
describe('prisma migrate deploy', () => {
  it('applies the migrations to an empty database', { timeout: 120_000 }, async () => {
    const db = await PGlite.create();
    const port = await freePort();
    const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 10 });
    await server.start();
    try {
      const cwd = fileURLToPath(new URL('..', import.meta.url));
      const { stdout } = await promisify(exec)('npx prisma migrate deploy', {
        cwd,
        env: {
          ...process.env,
          DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
          DB_SCHEMA: 'chess',
        },
      });
      expect(stdout).toContain('successfully applied');
      const tables = await db.query<{ tablename: string }>(
        `select tablename from pg_tables where schemaname = 'chess' order by 1`,
      );
      expect(tables.rows.map((r) => r.tablename)).toEqual(
        expect.arrayContaining([
          'Game',
          'Rating',
          'RatingEvent',
          'ReviewReport',
          'Session',
          'User',
          '_prisma_migrations',
        ]),
      );
      const pub = await db.query(`select tablename from pg_tables where schemaname = 'public'`);
      expect(pub.rows).toEqual([]);
    } finally {
      await server.stop();
      await db.close();
    }
  });
});
