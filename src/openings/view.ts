import { findOpening, gameFens, type OpeningMatch, type OpeningTable } from './lookup';

let table: Promise<OpeningTable> | null = null;
/** The table once it has loaded. */
let loaded: OpeningTable | null = null;
/** The latest request per element, so an answer that arrives late never overwrites a newer one. */
const latest = new WeakMap<HTMLElement, symbol>();

/**
 * The opening names, loaded on first need as a chunk of their own, so they stay out of the main bundle and the
 * render-blocking path. A failed load is retried on the next request.
 */
function loadTable(): Promise<OpeningTable> {
  table ??= import('./data/openings.json').then(
    (data) => (loaded = data.positions as unknown as OpeningTable),
    (error: unknown) => {
      table = null;
      throw error;
    },
  );
  return table;
}

function render(el: HTMLElement, match: OpeningMatch | null): void {
  if (!match) {
    el.replaceChildren();
    el.removeAttribute('title');
    return;
  }
  const eco = document.createElement('span');
  eco.className = 'opening-eco';
  eco.textContent = match.eco;
  el.replaceChildren(eco, ` ${match.name}`);
  el.title = `${match.eco} ${match.name}`;
}

/**
 * Shows the deepest known opening of a game in `el` (ECO code, then the name), or empties it when the game has no
 * moves or reaches no named position. The element's height is reserved in the CSS, so filling it never moves the page.
 */
export function showOpening(el: HTMLElement, startFen: string, sans: readonly string[]): void {
  const request = Symbol('opening');
  latest.set(el, request);
  if (!sans.length) {
    render(el, null);
    return;
  }
  loadTable()
    .then((positions) => {
      if (latest.get(el) === request) render(el, findOpening(positions, gameFens(startFen, sans)));
    })
    .catch(() => {
      if (latest.get(el) === request) render(el, null);
    });
}

/**
 * The deepest known opening of a game, or null when it has none or the names have not loaded yet. Synchronous, so
 * copying or sharing the game keeps its user gesture; {@link showOpening} loads the names for any game with moves.
 */
export function loadedOpening(startFen: string, sans: readonly string[]): OpeningMatch | null {
  return loaded && sans.length ? findOpening(loaded, gameFens(startFen, sans)) : null;
}
