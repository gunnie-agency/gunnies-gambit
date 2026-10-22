import type { Color } from 'chess.js';
import { fetchFinishedGames, ImportError } from './fetch';
import {
  cleanUsername,
  listMessage,
  problemMessage,
  SITE_NAME,
  type GameSummary,
  type Outcome,
  type Site,
} from './games';

/** The part of the app the panel needs: open a game in Analyse and review it. */
export interface GameLoader {
  loadGame(pgn: string, options: { side: Color; review: boolean }): boolean;
}

const KEY = 'gunnies-gambit.import.v1';
const COLOR_NAME: Record<Color, string> = { w: 'White', b: 'Black' };
const OUTCOME_TEXT: Record<Outcome, string> = { win: 'Won', loss: 'Lost', draw: 'Draw' };
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

interface LastImport {
  site: Site;
  username: string;
}

/** The last site and username, a convenience only: anything odd in storage is ignored. */
function loadLast(): LastImport | null {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
  const { site, username } = (raw ?? {}) as Partial<Record<keyof LastImport, unknown>>;
  if ((site !== 'lichess' && site !== 'chesscom') || typeof username !== 'string') return null;
  const clean = cleanUsername(username);
  return clean ? { site, username: clean } : null;
}

function saveLast(last: LastImport): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(last));
  } catch {
    // Private mode or storage full: the username just isn't remembered.
  }
}

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function gameButton(game: GameSummary): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'import-game';
  const date = DATE.format(game.endedAt);
  const head = document.createElement('span');
  head.className = 'import-head';
  const opponent = document.createElement('span');
  opponent.className = 'import-opponent';
  opponent.textContent = `vs ${game.opponent}`;
  const outcome = document.createElement('span');
  outcome.className = `import-outcome ${game.outcome}`;
  outcome.textContent = OUTCOME_TEXT[game.outcome];
  head.append(opponent, outcome);
  const meta = document.createElement('span');
  meta.className = 'import-meta';
  meta.textContent = [COLOR_NAME[game.side], game.timeControl, date].filter(Boolean).join(' · ');
  button.append(head, meta);
  button.setAttribute(
    'aria-label',
    `${OUTCOME_TEXT[game.outcome]} as ${COLOR_NAME[game.side]} against ${game.opponent}, ${game.timeControl}, ${date}. Review this game.`,
  );
  return button;
}

/** Wires the "Your games" panel: one request per submit, never polling, and only finished games are listed. */
export function setupGameImport(app: GameLoader): void {
  const form = $<HTMLFormElement>('importForm');
  const siteSeg = $('importSite');
  const input = $<HTMLInputElement>('importUser');
  const submit = $<HTMLButtonElement>('importSubmit');
  const status = $('importStatus');
  const list = $<HTMLOListElement>('importList');

  let site: Site = 'lichess';
  let games: GameSummary[] = [];
  let pending: AbortController | null = null;

  const setStatus = (text: string, err = false) => {
    status.textContent = text;
    status.className = `hint${err ? ' err' : ''}`;
  };
  const setSite = (value: Site) => {
    site = value;
    for (const button of siteSeg.querySelectorAll<HTMLElement>('button[data-v]'))
      button.setAttribute('aria-pressed', String(button.dataset.v === value));
  };
  const showGames = (found: GameSummary[]) => {
    games = found;
    list.replaceChildren(
      ...found.map((game, i) => {
        const item = document.createElement('li');
        const button = gameButton(game);
        button.dataset.i = String(i);
        item.append(button);
        return item;
      }),
    );
    list.hidden = found.length === 0;
  };

  const last = loadLast();
  if (last) {
    setSite(last.site);
    input.value = last.username;
  }

  siteSeg.addEventListener('click', (e) => {
    const value = (e.target as HTMLElement).closest<HTMLElement>('button[data-v]')?.dataset.v;
    if (value === 'lichess' || value === 'chesscom') setSite(value);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = cleanUsername(input.value);
    if (!username) return setStatus('Enter a username: letters, digits, "_" or "-".', true);
    const from = site;
    saveLast({ site: from, username });
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    submit.disabled = true;
    showGames([]);
    setStatus(`Loading finished games from ${SITE_NAME[from]}…`);
    try {
      const found = await fetchFinishedGames(from, username, controller.signal);
      showGames(found);
      setStatus(listMessage(found.length, from, username));
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus(problemMessage(err instanceof ImportError ? err.problem : 'unavailable', from, username), true);
    } finally {
      if (pending === controller) {
        pending = null;
        submit.disabled = false;
      }
    }
  });

  list.addEventListener('click', (e) => {
    const index = (e.target as HTMLElement).closest<HTMLElement>('button[data-i]')?.dataset.i;
    const game = index === undefined ? undefined : games[Number(index)];
    if (!game) return;
    if (!app.loadGame(game.pgn, { side: game.side, review: true }))
      setStatus('That game could not be read. Try another one.', true);
  });
}
