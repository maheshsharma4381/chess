import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** The repo-root `.env` (secrets live there, shared with the web app's server routes). */
export const ROOT_ENV_FILE = resolve(fileURLToPath(new URL('../../../.env', import.meta.url)));

/** KEY=value pairs of a dotenv file: quotes stripped, `# comments` ignored. Missing file → {}. */
export function parseEnvFile(file: string): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    const quoted = /^(['"])(.*?)\1(\s+#.*)?$/.exec(value);
    out[key] = quoted ? (quoted[2] ?? '') : value.replace(/\s+#.*$/, '');
  }
  return out;
}

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// URL'),
  // Interpolated into SQL search_path by the migration helper, so it must be a bare identifier.
  DB_SCHEMA: z
    .string()
    .regex(/^[a-z_][a-z0-9_]{0,62}$/, 'must be a lowercase identifier')
    .default('chess'),
  REDIS_URL: z
    .string()
    .regex(/^rediss?:\/\//, 'must be a redis:// URL')
    .default('redis://127.0.0.1:6379'),
  AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  LICHESS_API_TOKEN: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.url().optional(),
  STOCKFISH_PATH: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface Config {
  port: number;
  databaseUrl: string;
  dbSchema: string;
  redisUrl: string;
  authSecret: string;
  webOrigin: string;
  lichessToken: string | undefined;
  google: { clientId: string; clientSecret: string; redirectUri: string } | null;
  stockfishPath: string | undefined;
  production: boolean;
  logLevel: z.infer<typeof schema>['LOG_LEVEL'];
}

/**
 * Configuration from the process environment, then the dotenv files (first file wins).
 * Keys match case-insensitively, because the shared `.env` uses `database_url`.
 */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  files: string[] = [ROOT_ENV_FILE],
): Config {
  const fromFiles = files.map(parseEnvFile);
  const lookup = (key: string): string | undefined => {
    const lower = key.toLowerCase();
    for (const source of [env, ...fromFiles]) {
      for (const [k, v] of Object.entries(source)) {
        if (v !== undefined && v !== '' && k.toLowerCase() === lower) return v;
      }
    }
    return undefined;
  };
  const raw = Object.fromEntries(Object.keys(schema.shape).map((k) => [k, lookup(k)]));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid server configuration: ${problems.join('; ')}`);
  }
  const c = parsed.data;
  return {
    port: c.PORT,
    databaseUrl: c.DATABASE_URL,
    dbSchema: c.DB_SCHEMA,
    redisUrl: c.REDIS_URL,
    authSecret: c.AUTH_SECRET,
    webOrigin: c.WEB_ORIGIN.replace(/\/$/, ''),
    lichessToken: c.LICHESS_API_TOKEN,
    google:
      c.GOOGLE_CLIENT_ID && c.GOOGLE_CLIENT_SECRET
        ? {
            clientId: c.GOOGLE_CLIENT_ID,
            clientSecret: c.GOOGLE_CLIENT_SECRET,
            redirectUri:
              c.GOOGLE_REDIRECT_URI ??
              `${c.WEB_ORIGIN.replace(/\/$/, '')}/api/v1/auth/google/callback`,
          }
        : null,
    stockfishPath: c.STOCKFISH_PATH,
    production: c.NODE_ENV === 'production',
    logLevel: c.LOG_LEVEL,
  };
}
