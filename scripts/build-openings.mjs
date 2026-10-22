// Builds src/openings/data/openings.json, the opening names by position, from the Lichess openings dataset.
// Run by hand when the dataset changes: `node scripts/build-openings.mjs [commit]`, then commit the JSON.
//
// Source: https://github.com/lichess-org/chess-openings (a.tsv to e.tsv; columns eco, name, pgn), pinned to the
// commit below so the output is reproducible. The dataset is dedicated to the public domain under CC0 1.0
// (https://creativecommons.org/publicdomain/zero/1.0/).
//
// Each line is replayed with chess.js and keyed by the EPD of its final position (the FEN without the move
// counters), so a game that reaches the position by another move order still finds the name. When two lines end in
// the same position, the first in the files (by ECO code) wins.
import { Chess } from 'chess.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { epd } from '../src/openings/lookup.ts';

const REPO = 'lichess-org/chess-openings';
const COMMIT = process.argv[2] ?? 'a6189a30dc273ccb21fc2536a9a2fefd5592a67a';
const FILES = ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv'];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src', 'openings', 'data', 'openings.json');

function fail(message) {
  console.error(`build-openings: ${message}`);
  process.exit(1);
}

async function download(file) {
  const url = `https://raw.githubusercontent.com/${REPO}/${COMMIT}/${file}`;
  const response = await fetch(url);
  if (!response.ok) fail(`${url}: HTTP ${response.status}`);
  return response.text();
}

/** The PGN movetext without move numbers, as SAN moves. */
function sanMoves(pgn) {
  return pgn.split(/\s+/).filter((token) => token && !/^\d+\.+$/.test(token));
}

const positions = {};
let lines = 0;
let duplicates = 0;
for (const file of FILES) {
  const [header, ...rows] = (await download(file)).trim().split('\n');
  if (header !== 'eco\tname\tpgn') fail(`${file}: unexpected header "${header}"`);
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t');
    if (!eco || !name || !pgn) fail(`${file}: malformed row "${row}"`);
    const game = new Chess();
    for (const san of sanMoves(pgn)) game.move(san);
    const key = epd(game.fen());
    lines++;
    if (key in positions) duplicates++;
    else positions[key] = [eco, name];
  }
}

const data = {
  source: `https://github.com/${REPO}/tree/${COMMIT}`,
  license: 'CC0-1.0',
  positions,
};
// Formatted like the rest of the repository, one position per line, so an update shows as a readable diff. The
// build minifies it again.
const options = await resolveConfig(out);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, await format(JSON.stringify(data), { ...options, parser: 'json' }));
console.log(
  `build-openings: ${Object.keys(positions).length} positions from ${lines} lines (${duplicates} duplicates skipped)`,
);
