import 'server-only';

/**
 * Server-only secrets. Next loads `.env` from apps/web, but this monorepo keeps secrets in the
 * repo-root `.env`, and @next/env caches its first load, so a second loadEnvConfig() is a
 * no-op. Route handlers ask for a secret here instead: process env first, then the files.
 * The server-only import makes a client import a build error.
 */
export { readEnvValue, serverSecret } from './dotenv';
