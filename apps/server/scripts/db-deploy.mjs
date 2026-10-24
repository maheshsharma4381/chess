// Applies pending migrations (`prisma migrate deploy`) to the configured database.
// It never drops or rewrites anything: only migrations not yet recorded in
// "<schema>"._prisma_migrations run. prisma.config.ts reads the URL and schema.
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
