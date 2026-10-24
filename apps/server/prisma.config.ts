import { defineConfig } from 'prisma/config';
import { ROOT_ENV_FILE, parseEnvFile } from './src/config';

// Migrations target the app's own schema (never Supabase's PostgREST-exposed `public`).
const file = parseEnvFile(ROOT_ENV_FILE);
const base =
  process.env['DATABASE_URL'] ??
  file['DATABASE_URL'] ??
  file['database_url'] ??
  // `prisma generate` and `migrate diff --from-empty` never connect.
  'postgresql://localhost:5432/placeholder';
const schema = process.env['DB_SCHEMA'] ?? file['DB_SCHEMA'] ?? 'chess';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: `${base}${base.includes('?') ? '&' : '?'}schema=${schema}` },
});
