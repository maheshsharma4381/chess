// Copies Stockfish 19 lite single-threaded (GPL-3.0) from node_modules into public/engine,
// together with its license. Runs before `next dev` / `next build`.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve('stockfish'));
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'engine');
mkdirSync(outDir, { recursive: true });

const files = [
  ['bin/stockfish-19-lite-single.js', 'stockfish-19-lite-single.js'],
  ['bin/stockfish-19-lite-single.wasm', 'stockfish-19-lite-single.wasm'],
  ['Copying.txt', 'Copying.txt'],
];

for (const [from, to] of files) {
  const src = join(pkgDir, from);
  const dest = join(outDir, to);
  if (!existsSync(src)) throw new Error(`Missing ${src}; is the stockfish package installed?`);
  if (existsSync(dest) && statSync(dest).size === statSync(src).size) continue;
  copyFileSync(src, dest);
  console.log(`engine: copied ${to}`);
}
