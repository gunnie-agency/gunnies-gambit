// Copies third-party runtime assets from node_modules into public/, so they are served from our own origin.
// Runs on `npm install` (postinstall). The output directories are git-ignored.
//
// - Stockfish lite single-threaded WASM build (GPL-3.0) -> public/stockfish/
// - Cburnett piece set, as embedded in Chessground's CSS (GPL-3.0-or-later) -> public/pieces/cburnett/
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(root, 'node_modules');

function fail(message) {
  console.error(`copy-assets: ${message}`);
  process.exit(1);
}

function copyStockfish() {
  const pkgDir = join(modules, 'stockfish');
  const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  // The package names its files by major version; ours carry the full version, so a patch release never
  // pairs a cached .js with a new .wasm.
  const source = `stockfish-${version.split('.')[0]}-lite-single`;
  const target = `stockfish-${version}-lite-single`;
  const outDir = join(root, 'public', 'stockfish');
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const [from, to] of [
    [join(pkgDir, 'bin', `${source}.js`), `${target}.js`],
    [join(pkgDir, 'bin', `${source}.wasm`), `${target}.wasm`],
    [join(pkgDir, 'Copying.txt'), 'COPYING.txt'],
  ]) {
    if (!existsSync(from)) fail(`missing ${from}`);
    copyFileSync(from, join(outDir, to));
  }
  console.log(`copy-assets: Stockfish ${version} -> public/stockfish/${target}.*`);
}

function extractPieces() {
  const css = join(modules, 'chessground', 'assets', 'chessground.cburnett.css');
  if (!existsSync(css)) fail(`missing ${css}`);
  const outDir = join(root, 'public', 'pieces', 'cburnett');
  mkdirSync(outDir, { recursive: true });
  const letter = { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' };
  const re = /piece\.(\w+)\.(white|black)\s*\{\s*background-image:\s*url\('data:image\/svg\+xml;base64,([^']+)'\)/g;
  let count = 0;
  for (const [, role, color, data] of readFileSync(css, 'utf8').matchAll(re)) {
    if (!letter[role]) continue;
    writeFileSync(join(outDir, `${color[0]}${letter[role]}.svg`), Buffer.from(data, 'base64'));
    count++;
  }
  if (count !== 12) fail(`expected 12 pieces in ${css}, found ${count}`);
  console.log('copy-assets: Cburnett pieces -> public/pieces/cburnett/');
}

copyStockfish();
extractPieces();
