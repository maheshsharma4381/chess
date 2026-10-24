import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { createPrisma, type PrismaClient } from '../../src/db';
import { freePort } from './redis';

const MIGRATIONS = fileURLToPath(new URL('../../prisma/migrations', import.meta.url));
export const TEST_SCHEMA = 'chess';

/** The migration files in order, as `prisma migrate deploy` would apply them. */
export function migrationSql(): string[] {
  return readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8'));
}

export interface TestDb {
  prisma: PrismaClient;
  url: string;
  /** Empties every app table. */
  reset(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * An in-process Postgres 17 (PGlite) behind the Postgres wire protocol, so the app talks to
 * it through the same pg + PrismaPg path it uses in production.
 */
export async function startTestDb(): Promise<TestDb> {
  const db = await PGlite.create();
  for (const sql of migrationSql()) {
    await db.exec(
      `CREATE SCHEMA IF NOT EXISTS "${TEST_SCHEMA}"; SET search_path TO "${TEST_SCHEMA}";\n${sql}`,
    );
  }
  const port = await freePort();
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 20 });
  await server.start();
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  const prisma = createPrisma(url, TEST_SCHEMA, { max: 5 });
  const tables = (
    await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = $1 and tablename <> '_prisma_migrations'`,
      [TEST_SCHEMA],
    )
  ).rows.map((r) => `"${TEST_SCHEMA}"."${r.tablename}"`);
  return {
    prisma,
    url,
    reset: async () => {
      await prisma.$executeRawUnsafe(`TRUNCATE ${tables.join(', ')} CASCADE`);
    },
    stop: async () => {
      await prisma.$disconnect();
      await server.stop();
      await db.close();
    },
  };
}
