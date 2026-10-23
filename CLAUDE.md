# Gunnie's Gambit: chess practice partner and coach

A browser app for learning and practising chess with Stockfish running entirely client-side. You play against the
engine at a level you choose, ask for hints, and review your mistakes after the game. An analysis board lets
you set up or enter any position and see what the engine thinks. Live at https://chess.gunnie.nl.

It is also a public showcase project for Gunnie, so code quality, tests, commit history and a clean README matter as
much as features. The display name lives in one place, `VITE_APP_NAME` in `.env`; the public URL is `VITE_SITE_URL`.
Don't hardcode either elsewhere. How to contribute (setup, checks, adding lessons, what gets declined) is in
`CONTRIBUTING.md`.

## Modes

1. **Analysis board.** Enter moves for both sides (tap/click or SAN/UCI text), see best move, eval, top 3 lines,
   arrows. FEN/PGN load and copy, PGN download and share with proper headers (`src/util/pgn.ts`). Step through the
   move list (`src/util/cursor.ts`: ←/→/Home/End in the list); a move from an earlier position branches, and Undo
   takes it back. Playing the move the game went on with just steps forward, and a mode or side change forgets the
   line Undo could restore. A loaded or imported game keeps its tags (Event, Site, Date, Round, White, Black, Result,
   TimeControl, WhiteElo, BlackElo) in the exported PGN, also across a reload, until a move changes the game; every
   export adds ECO and Opening. `readPgn` reads every PGN the app loads and accepts escaped quotes in tags, which
   chess.js 1.4 rejects. Also usable for games against computer bots on other sites, where the site allows it.
2. **Play vs engine.** A second engine worker plays the other side at a chosen strength (`UCI_LimitStrength` /
   `UCI_Elo`, plus beginner levels below the Elo floor via `Skill Level` and a shallow depth; the Elo levels carry a
   descriptor, "Elo 1400 · casual player" to "Elo 2400 · master", in `src/engine/levels.ts`). The evaluation and the
   best move are separate toggles, both off by default; a hint can be requested per position. Resign (after a
   confirm) ends the game as a loss, saved with the game and taken back by Undo (taking the other side afterwards keeps
   which colour resigned, as with a checkmate); at a game's end the status points to
   the review, and only the result panel's "Review game" shows (the one in Moves keeps its space, hidden).
3. **Review.** Not a third `Mode` but a state on top of the current game, started with "Review game" when a play-mode
   game ends or for any game in Analyse. It runs on a pool of 1 to 3 review workers (`reviewWorkerCount` in
   `src/review/runner.ts`: 2 from 4 cores, 3 only with 8+ cores and 8 GB `deviceMemory`), created on open and
   terminated on close; the other engines stay idle meanwhile. Each position is searched with `go nodes 400000` after
   `Clear Hash`, so a result does not depend on the order or the pool size; cache keys carry the prefix `clear|`.
   Moves are judged by lost winning chances on the Lichess curve (0.1 / 0.2 / 0.3) plus Lichess's mate rules, and the
   engine's own choice is never marked. Results are cached by position in localStorage (last reviewed game only).
   The texts (`src/review/describe.ts`) add facts without changing the judgement: a mating move is "Checkmate.", a
   move that allows mate in one says so, material hung or lost (3 points or more, a promotion
   allowed included) is named unless the move forces mate, and an unmarked move in a
   decided game says the game was already decided. "Next mistake" stops on mistakes and blunders only.
   **Practise my mistakes** (`src/review/retry.ts`) then replays the positions before the user's own mistakes and
   blunders; an answer is good when it is the engine's choice or a move the review would not mark. Positions not yet
   known are searched on the review workers.

**Engines start only when needed** (`syncEngines` / `warmOpponent` in `src/ui/app.ts`): the analysis worker for a
hint, the evaluation or best move in Play, or Analyse; in Play only the opponent loads up front, and never while the
analysis engine is still compiling.

**Practice links** `#fen=…&mode=play&side=…&level=…[&goal=mate|promote|first]` (`src/util/link.ts`; an unknown goal
is ignored), used by the endgames and "Play your first game" on How to play, open in Play with the hash cleared, and
the status line's small line says the goal ("Practice: mate the lone king.", "Your first game, at the Beginner
level.") for as long as that game lasts. The link's side and level hold for that game
only: they are saved beside the user's own as `practice` (`src/state.ts`), so a reload keeps them, and New game or
loading another game brings the user's own back. Links to positions that cannot arise (`fenProblem`
in `src/util/moves.ts`) are refused, and a saved game whose start position `fenProblem` refuses replays from the
standard start (`src/state.ts`). Typed input accepts lower case (`nf3`, `e8q`, `o-o`; a leading `b` is a b-file
pawn when that move is legal, otherwise a bishop); a promotion without a piece is a queen (`e7e8`, `e8`).

**Your games** (`src/import/`): lists the user's finished Lichess or Chess.com games by username and opens one in
Analyse for review. Only the username goes to the chosen site, straight from the browser, with `credentials: 'omit'`
and no referrer; the last site and username are kept in localStorage. Games abandoned before the first move are left
out. CSP `connect-src` allows both APIs.

**Opening names** (`src/openings/`): looked up by position (EPD) in a lazily loaded chunk generated by
`scripts/build-openings.mjs` from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0),
pinned to commit `a6189a30dc273ccb21fc2536a9a2fefd5592a67a`. Regenerate by hand and commit the JSON.

**How to play** is a second page (`how-to-play.html`, served as `/how-to-play`, own entry `src/learn/main.ts`, no
engine): the rules for beginners with a practice board per rule, first tactics, basic endgames, and how to use the
app. Each board is a lesson in `src/learn/lessons.ts`: `squares` (nothing moves; a tapped square is named with its
piece and letter), `free` (move one piece around, White always to move), `task` (one move: a wrong one is taken back
with "Not quite: … Try again.", a right one gets feedback until reset), `game` (both sides), `puzzle` (the side to move plays `solution` and the board
answers, turned so that side is at the bottom; any checkmate also solves it) or `mate` (mate a lone king moved by the
scripted defender in `src/learn/defender.ts`). There are 12 tactics puzzles grouped by theme and three endgames
(K+Q and K+R mates against the defender, K+P for the opposition) with practice links to play them out at full
strength. Solved puzzles and mates are stored in localStorage `gunnies-gambit.lessons.v1` (`src/learn/progress.ts`)
and counted per section (the endgames count their two mates). A square a selected piece can't reach gets a message
saying why (`cannotReach` in `src/util/reach.ts`, shared with the app, which shows it in the status line above the
board until the next tap or move), and nothing moves. A "Reading and writing moves" section (`#notation`) explains square names and SAN, and
"Play your first game" is a practice link from the start position at the Beginner level (`FIRST_GAME`). The intro text next to each board lives in the HTML so it is indexable and the layout is
final before the script runs.

## Fair play (hard constraint)

For practice, bots and review only. Do **not** build anything aimed at using it in games against humans: no reading
moves from Chess.com/Lichess pages or screens, no browser extension, no stealth or quick "live game" modes, no
importing games in progress. Analyse is worded as neutral position analysis ("White to move", "Best move for
Black"), never as a relay of a live game: no "your opponent", no "enter their move", no "play the suggestion". The README and the app footer state that engine help in any online game against a human
(rated or casual) or in over-the-board tournament games is against the rules and gets accounts banned on Chess.com and
Lichess.

## Stack

- **Vite + TypeScript**, vanilla modules, no UI framework.
- **chess.js 1.x** (camelCase API; `move()` throws on illegal moves).
- **Stockfish** from the `stockfish` npm package, lite single-threaded WASM build. `scripts/copy-assets.mjs` copies it
  (and the Cburnett pieces from Chessground) into `public/` on install, with the full Stockfish version in the file
  name; both directories are git-ignored. No fallback engine. Keep the UI wording neutral ("the computer", "the
  engine"); Stockfish is credited in the footer and README.
- **Static hosting only**, no backend. Game data never leaves the browser; the one exception is the username typed
  under Your games, which the browser sends to the site the user picks. The only third party on every page is
  cookieless Cloudflare Web Analytics (visit counts), injected into production builds by a Vite plugin from
  `VITE_CF_ANALYTICS_TOKEN`; the CSP allows exactly its two hosts, plus the Lichess and Chess.com APIs in
  `connect-src`. Never add cookies, consent-requiring trackers or analytics on game content. Cloudflare Workers static
  assets (`wrangler.jsonc`, custom domain `chess.gunnie.nl`); relative base path so any static host works.
- **Offline**: a service worker (`src/sw/`: `precache.ts` builds the precache list and cache version, `policy.ts`
  decides network-first for pages and cache-first for hashed files, `register.ts` installs it in production builds
  only) built to `/sw.js`, which `_headers` serves `no-cache`. It never calls `skipWaiting`, by design: taking over a
  running page would delete the cache that page still loads engine files from.
- **Move sounds**: optional, off by default, synthesised with Web Audio (`src/util/sounds.ts` for the tones,
  `src/ui/sound.ts` plays them). Audio is unlocked on pointerup, click and touchend as well as pointerdown and keydown,
  because iOS WebKit does not count a touch's pointerdown as a gesture, and any context that is not running is resumed.
- **Vitest** for unit tests, **Playwright** for end-to-end tests (`e2e/`), **ESLint** (typescript-eslint strict plus
  SonarJS recommended, the rules SonarQube applies, so CI fails on what the Sonar IDE plugin flags) and **Prettier**
  (120 columns).

## Layout

```
src/
  main.ts       bootstrap
  fonts.ts      web font imports shared by both pages (Latin subsets)
  state.ts      settings, game and review-cache persistence (localStorage)
  board/        board rendering (also pre-rendered at build time by boardHtml), arrows, promotion picker
  engine/       UCI worker wrapper, info parsing, search queue, strength levels
  review/       classify.ts (judgements, accuracy), describe.ts (review texts), runner.ts (search order, worker pool, cache), graph.ts (eval graph
                SVG), retry.ts (practising mistakes), view.ts (review panel, owns the move list while open)
  learn/        How to play page: lessons.ts (positions, puzzles, feedback), practice.ts (board state), defender.ts
                (lone-king defender), progress.ts (solved lessons), view.ts (DOM)
  import/       Your games: lichess.ts and chesscom.ts (URLs and parsing), games.ts (summaries, messages), fetch.ts,
                view.ts (panel)
  openings/     lookup.ts (EPD lookup), view.ts (lazy loading), data/openings.json (generated)
  sw/           service worker: sw.ts, precache.ts, policy.ts, register.ts
  ui/           app controller; chrome.ts for the theme switch; sound.ts for move sounds
  util/         SAN/UCI helpers, move input, cursor (move list position), pgn, sounds (tones), practice links, score
                formatting, HTML escaping, reach (why a tapped square can't be reached)
  site/         JSON-LD, FAQ, robots.txt, sitemap, manifest, llms.txt, IndexNow key; partials.ts for the logo symbol
                and footer shared by both pages; built from .env by a Vite plugin
e2e/            Playwright tests against the production build; fixtures.ts cuts off the outside world;
                screenshots.ts takes the README screenshots (docs/screenshots/)
public/         _headers, icons, social card, 404 page
```

Pure logic (UCI parsing, score conversion, PV to SAN, search queue, move input, cursor, PGN, HTML escaping, review
classification, runner, graph and retry, practice boards, defender and progress, game import parsing, opening lookup,
service worker policy and precache list) lives in modules without DOM access and has unit tests next to it
(`*.test.ts`).

## Accessibility and first paint

- Each board has one tab stop (roving tabindex); arrow keys move between squares. Focus rings use the
  `--focus-ring` / `--focus-ring-inner` tokens so they show on every square colour.
- CLS must stay 0: anything above the board is rendered at build time or has reserved space. The start position is
  pre-rendered into `index.html` (`boardHtml`, `<!-- %BOARD% -->`), and so are the opponent levels (`LEVELS`,
  `<!-- %LEVEL_OPTIONS% -->`). The inline `themeInit` script in `vite.config.ts` sets `data-theme`, `data-evalbar` and
  `data-mode` on `<html>` before paint from localStorage (a practice link in the hash keeps it in Play), and the saved
  game's number of move-list rows in `--saved-rows`, which the page's initial move list (`.initial`) keeps room for.
  In Analyse the three engine lines have fixed one-line rows from the first paint. `e2e/layout-shift.spec.ts` holds
  CLS under 0.01 on both pages at 375px and 1280px, cold, for a returning Analyse user and
  for a saved game that starts with Black to move.

## Testing and CI

- `npm test` (Vitest), `npm run lint`, `npm run format:check`, `npm run build`, and `npm run e2e` (builds, then runs
  Playwright). Projects: `desktop` and `phone` against `vite preview`, and `cloudflare` against `wrangler dev`, which
  applies the real `_headers` (CSP, caching). Without Playwright's Chromium, set `PW_CHROMIUM_PATH` to a local Chrome.
  `layout-shift.spec.ts` measures CLS on load at 375px and 1280px in the desktop project only: the phone project's
  mobile emulation does not report a web font's shift.
- Every e2e test runs with outside requests blocked and fails on console errors (`e2e/fixtures.ts`); tests that need
  Lichess or Chess.com answers route them to fixtures.
- `npm run screenshots` (`e2e/screenshots.ts`, own config `playwright.screenshots.config.ts`, not part of `npm run e2e`)
  retakes the README screenshots in `docs/screenshots/` from the existing `dist/` (build first) on its own preview
  port, 4183. It seeds each game as the saved game in localStorage, waits on the page's text, and has the browser
  encode WebP (quality 0.9), so it needs no image tool. Rerun it when the layout changes visibly, and look at the
  images before committing.

## Deployment

GitHub Actions (`.github/workflows/ci.yml`): every push to `master` and every pull request runs lint, format check,
tests and build, then the e2e job against that build. A push to `master` then deploys the tested `dist/` with
`wrangler deploy`, using the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets, and pings
IndexNow (`scripts/indexnow.mjs`, key `INDEXNOW_KEY` in `.env`). A new push to a pull request cancels its older run;
runs on `master` never are. Dependabot (`.github/dependabot.yml`) runs monthly: minor and patch updates grouped, majors
in their own pull request; `stockfish` and `chess.js` are ignored on purpose (a new version changes what reviews and
lessons say), as are `@types/node` majors (they follow `.nvmrc`).

Caching and security headers are in `public/_headers`: HTML is `no-cache`, `/assets/*` and the versioned engine files
immutable, `/sw.js` `no-cache`, and the CSP needs `'wasm-unsafe-eval'` for the engine. The theme script that runs
before first paint is inline in each page's head (`themeInit` in `vite.config.ts`); the build puts its hash into the
CSP in place of `%THEME_INIT_SHA256%`, so edit the script there and never hand-write the hash. Fonts are imported
once, in `src/fonts.ts`, Latin subsets only, so no font is small enough for Vite to inline; the build fails if a
`data:` font reaches the CSS, and `font-src` is `'self'` only. Each web font has a local fallback face scaled to its
metrics at the top of `src/style.css` (Instrument Sans, the Instrument Serif italic and JetBrains Mono), so the swap
does not move the page. Cloudflare allows one `*` per `_headers` rule. The
sitemap's `lastmod` and the structured data's `dateModified` come from the date of the last commit.

## Next milestones

1. More lessons: further puzzle themes, more endgames (the opposition in more depth, rook endings), and a few
   opening principles.
2. A short guided first game for complete beginners, linking the rules page to a first game at the Beginner level.

## Constraints

- **License: GPL-3.0-or-later** (Stockfish is GPLv3 and we ship it). Keep the Stockfish licence link and attribution,
  the piece set's licence and the CC0 credit for the opening names.
- Works on a phone (big touch targets, portrait layout) and in a narrow desktop window.
- Accessibility: every square is a focusable button with an aria-label and no other text (the coordinates are drawn by CSS from `data-coord`); visible focus states; respect
  `prefers-reduced-motion`.
- **Look and feel of gunnie.nl**: near-black `#0b0d11`, accent `#00a1ff`, white hairline borders, Instrument Sans with
  one Instrument Serif italic accent, JetBrains Mono eyebrows. Dark is the default; a header button switches to the
  light variant. All colours are CSS tokens at the top of `src/style.css`; rules below the token blocks use none of
  their own.
- The Gunnie logo is defined once as an SVG `<symbol id="gunnie-logo">` in `src/site/partials.ts`, put into each page
  in place of `<!-- %LOGO_SYMBOL% -->`, and reused in the header lockup (logo + last word of `VITE_APP_NAME`) and the
  footer. Referencing elements use `viewBox="0 0 493 97"`; the symbol carries the real crop, and repeating it on the
  outer `<svg>` clips the logo.
