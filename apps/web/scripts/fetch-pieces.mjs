// Downloads the cburnett piece set (Colin M. L. Burnett; tri-licensed GPL/BSD/GFDL on
// Wikimedia Commons, used here under BSD) into public/pieces/cburnett as wK.svg ... bP.svg.
// Idempotent: existing files are kept, so builds work offline once the set is committed.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'pieces', 'cburnett');
mkdirSync(outDir, { recursive: true });

const HEADERS = { 'User-Agent': 'chess-platform-build/0.1 (asset fetch; ved300406@gmail.com)' };
const PIECES = ['k', 'q', 'r', 'b', 'n', 'p'];
// Downloaded SVG is untrusted: refuse anything that could run code if ever inlined.
const UNSAFE = /<script|\son\w+\s*=|javascript:|<foreignObject/i;

async function licenseOf(file) {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${file}&prop=imageinfo&iiprop=extmetadata&format=json`;
    const json = await (await fetch(url, { headers: HEADERS })).json();
    const page = Object.values(json.query.pages)[0];
    return page.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value ?? 'unknown';
  } catch {
    return 'not verified (Commons API unreachable)';
  }
}

/** upload.wikimedia.org path: /<md5[0]>/<md5[0..2]>/<file> (commons.wikimedia.org may be unreachable). */
function uploadUrl(file) {
  const md5 = createHash('md5').update(file).digest('hex');
  return `https://upload.wikimedia.org/wikipedia/commons/${md5[0]}/${md5.slice(0, 2)}/${file}`;
}

for (const piece of PIECES) {
  for (const [shade, color] of [
    ['l', 'w'],
    ['d', 'b'],
  ]) {
    const dest = join(outDir, `${color}${piece.toUpperCase()}.svg`);
    if (existsSync(dest)) continue;
    const file = `Chess_${piece}${shade}t45.svg`;
    const res = await fetch(uploadUrl(file), { headers: HEADERS });
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    const svg = await res.text();
    if (!svg.includes('<svg') || UNSAFE.test(svg))
      throw new Error(`${file}: rejected unexpected SVG content`);
    writeFileSync(dest, svg);
    console.log(
      `pieces: ${file} -> ${color}${piece.toUpperCase()}.svg (license: ${await licenseOf(file)})`,
    );
  }
}
