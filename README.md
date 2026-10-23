# Gunnie's Gambit

[![CI](https://github.com/gunnie-agency/gunnies-gambit/actions/workflows/ci.yml/badge.svg)](https://github.com/gunnie-agency/gunnies-gambit/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)

Practise chess against the computer at your own level, ask for hints, review your games for mistakes, and analyse any
position. Everything runs in your browser: there is no backend, no account and no cookies, and after the first visit
it works offline.

**Try it: [chess.gunnie.nl](https://chess.gunnie.nl)**

[![Gunnie's Gambit: a chess board with the engine's best move](public/og.png)](https://chess.gunnie.nl)

## Features

- **Play** against the computer, from Beginner up to full strength, with the Elo levels described in plain words
  (`Elo 1400 · casual player` up to `Elo 2400 · master`). Hints on request; the evaluation and the best move (with
  engine lines) can each be switched on separately.
- **Analyse** any position: enter moves for both sides, see the best move, evaluation, top three lines and arrows.
  Step back through the move list (arrow keys, Home and End) and play a different move there to try another line;
  Undo takes it back.
- **Review** a game when it ends, or any game in Analyse (including an imported PGN). Every move is checked and
  marked as an inaccuracy (?!), mistake (?) or blunder (??), with the better move as an arrow, an eval graph and an
  accuracy per side. Step through with the buttons, the arrow keys or the clickable move list.
- **Practise my mistakes** after a review: the board goes back to the position before each of your own mistakes and
  blunders, and you look for a better move. The engine's choice counts, and so does any move the review would not
  have marked.
- **Your games**: type your Lichess or Chess.com username to list your recent finished games, and open one to
  review it.
- **Opening names** in the move list and the review, from the Lichess openings dataset.
- **How to play**: the rules for beginners, from how each piece moves to castling, en passant and promotion, with a
  small practice board for every rule; twelve tactics puzzles grouped by theme; the basic endgames (mate with king
  and queen or king and rook against a lone king the page defends, and king and pawn against king), each with a link
  to play the position out against the computer. Your browser remembers which puzzles you solved.
- Tap a piece and then its square, or tap only the square when just one piece can go there. Or type moves in SAN
  (`Nf3`, `exd5`, `O-O`, also `o-o` and `e8q`) or UCI (`e7e8q`); a promotion without a piece, such as `e8` or
  `e7e8`, is a queen.
- FEN and PGN import and export; download the game as a PGN file, or share it where the browser supports sharing.
  An exported game names its opening and keeps the players, date and result of a game you imported.
  The current game is remembered in your browser.
- Optional move sounds, off by default.
- Works on phones and desktop, dark and light theme, keyboard accessible: each board is one tab stop and the arrow
  keys move between its squares.

## How it works

The engine is [Stockfish 19](https://stockfishchess.org/), compiled to WebAssembly (the 1.9 MB single-threaded "lite"
build), served from the same origin and run in Web Workers. Single-threaded means no `SharedArrayBuffer`, so the site
needs no cross-origin isolation headers and works on any static host.

Two workers do the everyday work: one analyses the position for hints and evaluation, the other plays the opponent at
a limited strength (`UCI_Elo`, or `Skill Level` with a shallow search for the beginner levels). Keeping them apart
means the opponent's handicap never leaks into the hints. Each starts only when something needs it: in Play the
opponent loads up front, and the analysis engine waits for a hint, the evaluation or the best move, so the page
never compiles two engines at once without needing both.

A review runs on its own pool of one to three workers, created when it opens and terminated when it closes: two from
four cores, and a third only with eight cores and 8 GB of memory reported by the browser. Each position is searched
once with a fixed node count (`go nodes 400000`) after clearing the hash table. Unlike a time limit, that gives the
same result on every device; unlike a depth limit, it takes about as long in every position; and clearing the hash
makes the result independent of which worker searched it and in what order. On a fast desktop a 44-move game took
about 16 seconds with three workers, 22 with two and 42 with one.

A move is judged by how much of the mover's winning chances it lost, on the same curve and thresholds Lichess uses
(0.1 inaccuracy, 0.2 mistake, 0.3 blunder on a -1 to 1 scale), with Lichess's separate rules for missed and allowed
mates. Results are cached by position, so reopening a review after a reload is instant.

The interesting part is [`SearchQueue`](src/engine/queue.ts). UCI engines answer asynchronously, so when the position
changes during a search it sends `stop`, waits for that search's `bestmove`, and only then starts the newest request.
Output from stopped or superseded searches is dropped, so a suggestion is never shown for the wrong position, no
matter how fast moves are entered.

A service worker ([`src/sw/`](src/sw)) precaches the pages, scripts, fonts and engine, so after the first visit the
app works without a connection. Pages come from the network first, so a deploy shows at once; a new worker waits
until the old one's tabs are closed instead of taking over a running page.

No UI framework: plain TypeScript modules, with all chess logic ([chess.js](https://github.com/jhlywa/chess.js)), UCI
parsing, score conversion, review classification and lesson logic in DOM-free modules covered by unit tests. The
start position is rendered into the page at build time, so the board is there before any script runs.

```
src/
  engine/    UCI worker wrapper, info parsing, search queue, strength levels
  review/    move classification, review runner, eval graph, practising mistakes, review panel
  learn/     the How to play page: lessons and puzzles, practice board state, endgame defender, progress
  import/    Your games: Lichess and Chess.com game lists
  openings/  opening name lookup (data loaded on demand)
  board/     board rendering, arrows, promotion picker
  sw/        offline service worker: precache list, caching policy, registration
  ui/        app controller, theme switch, move sounds
  util/      SAN/UCI helpers, move input, move list cursor, PGN, score formatting
  site/      structured data, FAQ, robots.txt, sitemap, web app manifest, llms.txt, shared logo and footer
  state.ts   settings and game persistence (localStorage)
e2e/         Playwright tests against the production build
```

## Development

Requires Node.js 24 (see `.nvmrc`).

```bash
npm install          # also copies Stockfish and the piece set into public/
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run lint         # ESLint with typescript-eslint strict and SonarJS; npm run format for Prettier
npm run build        # type check + production build in dist/
npm run e2e          # build, then Playwright tests on desktop and phone, plus the real _headers via wrangler dev
```

`npm run e2e` needs Playwright's Chromium (`npx playwright install chromium`), or set `PW_CHROMIUM_PATH` to a local
Chrome. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add a lesson or puzzle and what kind of changes fit.

The display name and public URL live in [`.env`](.env). The build generates the structured data, the FAQ section,
`robots.txt`, `sitemap.xml`, `manifest.webmanifest`, `llms.txt` and the IndexNow key file from them
([`src/site/files.ts`](src/site/files.ts)); the FAQ text is written once there for both the page and the structured
data. The dev server serves the same files. The build uses a relative base path, so `dist/` can be served from any
static host or sub-path.

## Deployment

Every push to `master` runs lint, format check, tests and build in [GitHub Actions](.github/workflows/ci.yml), then
the Playwright tests against that build. When both pass, it deploys `dist/` to
[Cloudflare Workers](https://developers.cloudflare.com/workers/static-assets/) as a static site
([`wrangler.jsonc`](wrangler.jsonc)) and notifies [IndexNow](https://www.indexnow.org/), so Bing and other engines
recrawl it ([`scripts/indexnow.mjs`](scripts/indexnow.mjs)). Pull requests get the same checks without the deploy, and
a new push cancels the run it replaces. Dependabot proposes dependency updates monthly. Caching and security headers
are in [`public/_headers`](public/_headers).

## Privacy

Your games, settings, puzzle progress and analysis stay in your browser (`localStorage`). The one exception is Your
games: the username you type goes straight from your browser to the site you pick (Lichess or Chess.com), without
cookies or referrer, to fetch your game list. The last site and username are remembered in your browser.

To see how many people use the site, production builds include
[Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/), which counts page views without
cookies or personal data. It is added at build time from `VITE_CF_ANALYTICS_TOKEN` in [`.env`](.env); leave that
empty to build without it.

## Fair play

Gunnie's Gambit is for practice, games against computer bots and reviewing your own games. Using engine help in any
online game against a human, rated or casual, or in an over-the-board tournament is against the rules and gets
accounts banned on Chess.com and Lichess. It deliberately has no features for reading moves from other sites, and
Your games only lists games that have finished.

## License

GPL-3.0-or-later, see [LICENSE](LICENSE). Made by [Gunnie](https://gunnie.nl).

- [Stockfish](https://stockfishchess.org/) (GPL-3.0) via [stockfish.js](https://github.com/nmrugg/stockfish.js)
- [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause)
- Pieces by Colin M.L. Burnett, taken from [Chessground](https://github.com/lichess-org/chessground) (GPL-3.0-or-later)
- Opening names: [Lichess chess-openings](https://github.com/lichess-org/chess-openings), dedicated to the public
  domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- Fonts Instrument Sans, Instrument Serif and JetBrains Mono (SIL Open Font License) via
  [Fontsource](https://fontsource.org/)
