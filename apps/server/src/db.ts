import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export { Prisma, PrismaClient, type RatingPool } from './generated/prisma/client';

/** Every Glicko-2 pool a user has a rating in. */
export const RATING_POOLS = ['bullet', 'blitz', 'rapid', 'daily', 'puzzle'] as const;

/**
 * Prisma over node-postgres in the app's own schema. Remote databases get TLS (Supabase
 * requires it); localhost (PGlite in tests, a dev Postgres) does not.
 */
export function createPrisma(
  url: string,
  schema: string,
  opts: { max?: number } = {},
): PrismaClient {
  const host = new URL(url).hostname;
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const adapter = new PrismaPg(
    {
      connectionString: url,
      max: opts.max ?? 10,
      // Supabase's certificate chain is not in Node's default CA store; traffic is still encrypted.
      ssl: local ? false : { rejectUnauthorized: false },
    },
    { schema },
  );
  return new PrismaClient({ adapter });
}

/** Prisma's unique-constraint violation. */
export const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
