import 'server-only';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Server-only secrets. Next loads `.env` from apps/web, but this monorepo keeps secrets in the
 * repo-root `.env`, and @next/env caches its first load, so a second loadEnvConfig() is a
 * no-op. Route handlers ask for a secret here instead: process env first, then the files.
 * The server-only import makes a client import a build error.
 */

/** A KEY=value from a dotenv file (quotes stripped, comments ignored), or undefined. */
export function readEnvValue(file: string, key: string): string | undefined {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0 || line.slice(0, eq).trim() !== key) continue;
    const value = line.slice(eq + 1).trim();
    const quoted = /^(['"])(.*?)\1(\s+#.*)?$/.exec(value);
    if (quoted) return quoted[2];
    // Unquoted: " # note" starts a comment; a # inside the value (a#b) is kept.
    return value.replace(/\s+#.*$/, '');
  }
  return undefined;
}

const DEFAULT_FILES = () => [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];

export function serverSecret(
  key: string,
  opts: { env?: Record<string, string | undefined>; files?: string[] } = {},
): string | undefined {
  const env = opts.env ?? process.env;
  if (env[key]) return env[key];
  for (const file of opts.files ?? DEFAULT_FILES()) {
    const value = readEnvValue(file, key);
    if (value) return value;
  }
  return undefined;
}
