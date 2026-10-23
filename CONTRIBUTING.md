# Contributing to Gunnie's Gambit

Thanks for taking a look. Bug reports, lesson and puzzle ideas, and pull requests are all welcome. This page explains
how to set the project up, what the checks are, where things live, and which kinds of features the project will not
take.

## Setup

You need Node.js 24 (the version is in `.nvmrc`; `nvm use` picks it up).

```bash
npm install          # also copies Stockfish and the piece set into public/
npm run dev          # http://localhost:5173
```

The display name and public URL come from `.env`. There is no backend and nothing to configure beyond that.

## Checks

CI runs these on every pull request, and a pull request needs all of them green:

```bash
npm run lint           # ESLint: typescript-eslint strict plus SonarJS
npm run format:check   # Prettier, 120 columns (npm run format fixes it)
npm test               # unit tests (Vitest)
npm run build          # type check and production build
npm run e2e            # builds, then runs the Playwright tests
```

`npm run e2e` runs the app on a desktop and a phone viewport against `vite preview`, checks that neither page moves
while it loads (layout shift), and checks the security and caching headers against `wrangler dev`, which serves the
build with the real `public/_headers`. It needs Playwright's Chromium (`npx playwright install chromium`); to use the
Chrome you already have instead, set `PW_CHROMIUM_PATH`, for example
`PW_CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run e2e`. The tests block every
request that leaves your machine, so they never depend on Lichess, Chess.com or the analytics.

If a change alters what the app looks like, retake the README screenshots with `npm run screenshots` after
`npm run build`. It writes the images in `docs/screenshots/` from the build you just made, with the same
`PW_CHROMIUM_PATH` setting; check them before you commit.

## Where things live

- **Colours** are CSS tokens at the top of `src/style.css`, one block for dark (the default) and one for light. Rules
  below the token blocks use only tokens, never colours of their own.
- **Opponent levels** are in `src/engine/levels.ts`.
- **Lessons and puzzles** are in `src/learn/lessons.ts`; the text next to each board is in `how-to-play.html`.
- **FAQ, llms.txt and structured data** are in `src/site/files.ts`, written once for both the page and the
  machine-readable copies.
- **Opening names** are generated into `src/openings/data/openings.json` by `scripts/build-openings.mjs`; don't edit
  the JSON by hand.

Logic that needs no DOM (move input, review classification, lessons, game import parsing and so on) lives in its own
module with a `*.test.ts` next to it. New logic should follow that pattern.

## Adding a lesson or puzzle

1. Add an entry to `LESSONS` in `src/learn/lessons.ts` with a unique `id`, a `mode` and a `fen`. For a puzzle, give
   the `solution` in UCI (the reader's moves and the answers in turn, ending with the reader's move) and a `solved`
   text. Any checkmate also solves a puzzle.
2. Add the board to `how-to-play.html`: copy a neighbouring `lesson-row`, write the explanation, and set
   `data-lesson` to your id. A puzzle's message under the board starts with "White to move" or "Black to move".
3. If the section counts solved boards, raise the number in its `0 of N solved` line, and for a new tactics puzzle
   raise `PUZZLE_COUNT` in `src/site/files.ts`.
4. For a puzzle, add its id to `MATES` (with the number of moves to mate) or `MATERIAL` in
   `src/learn/lessons.test.ts`.

The tests then check the puzzle for you: the position is legal and every solution move is legal; a mate puzzle has
exactly one first move that mates in the given number of moves; a material puzzle wins at least a piece against every
defence; the page names the side to move; and the solved counters on the page match the lessons. `npm test` fails
until all of that holds, so an unsound puzzle cannot slip in.

## Fair play

Gunnie's Gambit is for practice, games against computer bots and reviewing your own finished games. Using engine help
in a game against a human, online or over the board, is cheating, and Chess.com and Lichess ban accounts for it. The
project will not help with that, so these requests are declined, however they are framed:

- reading moves from Chess.com, Lichess or any other site, from the page, the screen or a camera;
- browser extensions, overlays or anything that runs next to another chess site;
- quick or "stealth" modes meant to get a best move fast during a live game;
- importing or analysing games that are still being played.

The reason is simple: every one of these mainly helps someone cheat, and a practice tool that does them is a cheating
tool. Features that make practice and learning better are very welcome.

Some other requests don't fit the project's design rather than its rules: accounts, a backend, cloud sync, cookies or
new third-party services. Everything runs in the browser and stays there, and that is on purpose.

## Pull requests

Keep a pull request to one change, with a commit subject in the imperative ("Add …", "Fix …") and a body that says
why when it isn't obvious. Match the code around you, keep the tests green, and update the README if what users see
changes. By contributing you agree that your work is licensed under GPL-3.0-or-later, like the rest of the project.
