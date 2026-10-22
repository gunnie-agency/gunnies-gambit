import type { Chess, Color, PieceSymbol, Square } from 'chess.js';
import type { PromotionPiece } from '../util/uci.ts';

const FILES = 'abcdefgh';
const NAME: Record<PieceSymbol, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
// Relative to the page, like Vite's relative base, so the same markup works when rendered into the HTML at build time.
const PIECE_BASE = './pieces/cburnett/';

function pieceUrl(color: Color, type: PieceSymbol): string {
  return `${PIECE_BASE}${color}${type.toUpperCase()}.svg`;
}

function pieceImg(color: Color, type: PieceSymbol): string {
  return `<img class="pc" src="${pieceUrl(color, type)}" alt="" draggable="false">`;
}

/** Board coordinates (0..7, top-left origin) of a square for the given orientation. */
function xy(square: string, orient: Color): { x: number; y: number } {
  const f = FILES.indexOf(square[0] ?? 'a');
  const r = Number(square[1]) - 1;
  return orient === 'w' ? { x: f, y: 7 - r } : { x: 7 - f, y: r };
}

function squareAt(x: number, y: number, orient: Color): Square {
  return (orient === 'w' ? `${FILES[x]}${8 - y}` : `${FILES[7 - x]}${y + 1}`) as Square;
}

/** a1 is dark, h1 is light ("light on the right"). */
export function squareColor(square: string): 'light' | 'dark' {
  const file = FILES.indexOf(square[0] ?? 'a');
  const rank = Number(square[1]);
  return (file + rank) % 2 === 1 ? 'dark' : 'light';
}

export interface BoardView {
  game: Chess;
  orient: Color;
  selected: Square | null;
  /** The move to highlight, when it is not the game's own last move. */
  last?: { from: string; to: string };
}

/** What every square needs to know about the position, worked out once per render. */
interface SquareContext {
  game: Chess;
  selected: Square | null;
  last: { from: string; to: string } | undefined;
  /** Legal destinations of the selected piece: true for a capture. */
  targets: Map<string, boolean>;
  checkSquare: Square | undefined;
  /** The one square in the tab order; the arrow keys reach the others. */
  tabStop: Square;
}

/**
 * The square that holds the board's tab stop when focus is elsewhere: the selected piece, else the king of the side to
 * move, else one of its pieces (a free practice board has no king), else the bottom-left corner.
 */
export function defaultTabStop(view: BoardView): Square {
  const { game, orient, selected } = view;
  if (selected) return selected;
  const turn = game.turn();
  const king = game.findPiece({ type: 'k', color: turn })[0];
  const piece = game
    .board()
    .flat()
    .find((p) => p?.color === turn);
  return king ?? piece?.square ?? (orient === 'w' ? 'a1' : 'h8');
}

/**
 * The 64 square buttons for a position, top-left first. Pure, so the build can put the start position into the HTML
 * and the pieces show before the script runs. Only `tabStop` is in the tab order (a roving tabindex), so Tab passes a
 * board in one step instead of 64.
 */
export function boardHtml(view: BoardView, tabStop: Square = defaultTabStop(view)): string {
  const { game, orient, selected } = view;
  const targets = new Map<string, boolean>();
  if (selected) {
    for (const m of game.moves({ square: selected, verbose: true })) targets.set(m.to, m.isCapture());
  }
  const ctx: SquareContext = {
    game,
    selected,
    last: view.last ?? game.history({ verbose: true }).at(-1),
    targets,
    checkSquare: game.inCheck() ? game.findPiece({ type: 'k', color: game.turn() })[0] : undefined,
    tabStop,
  };

  let html = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) html += squareHtml(squareAt(x, y, orient), x === 0, y === 7, ctx);
  }
  return html;
}

export function renderBoard(el: HTMLElement, view: BoardView): void {
  const focused = el.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.sq : undefined;
  // Away from the board the tab stop stays where the reader left it, unless a piece has been selected since.
  const kept = view.selected ? undefined : el.querySelector<HTMLElement>('[data-sq][tabindex="0"]')?.dataset.sq;
  el.innerHTML = boardHtml(view, (focused ?? kept ?? defaultTabStop(view)) as Square);
  if (focused) el.querySelector<HTMLElement>(`[data-sq="${focused}"]`)?.focus();
}

/** One square's button, with the rank on the left edge and the file on the bottom edge. */
function squareHtml(sq: Square, leftEdge: boolean, bottomEdge: boolean, ctx: SquareContext): string {
  const piece = ctx.game.get(sq);
  let html = `<button type="button" class="${squareClasses(sq, ctx)}" data-sq="${sq}" aria-label="${squareLabel(sq, ctx)}" tabindex="${sq === ctx.tabStop ? 0 : -1}">`;
  if (leftEdge) html += `<span class="coord rank" aria-hidden="true">${sq[1]}</span>`;
  if (bottomEdge) html += `<span class="coord file" aria-hidden="true">${sq[0]}</span>`;
  if (piece) html += pieceImg(piece.color, piece.type);
  return html + '</button>';
}

function squareClasses(sq: Square, ctx: SquareContext): string {
  const classes = ['sq', squareColor(sq)];
  if (ctx.last?.from === sq || ctx.last?.to === sq) classes.push('last');
  if (ctx.selected === sq) classes.push('sel');
  if (ctx.checkSquare === sq) classes.push('check');
  const capture = ctx.targets.get(sq);
  if (capture !== undefined) classes.push(capture ? 'target capture' : 'target');
  return classes.join(' ');
}

function squareLabel(sq: Square, ctx: SquareContext): string {
  const piece = ctx.game.get(sq);
  let label: string = sq;
  if (piece) label += `, ${piece.color === 'w' ? 'white' : 'black'} ${NAME[piece.type]}`;
  if (ctx.selected === sq) label += ', selected';
  else if (ctx.targets.has(sq)) label += ', legal move';
  return label;
}

/** Arrow keys move focus between squares in screen direction, and the tab stop follows focus around the board. */
export function enableArrowKeys(el: HTMLElement): void {
  el.addEventListener('focusin', (e) => {
    const square = (e.target as HTMLElement).closest<HTMLElement>('[data-sq]');
    if (!square) return;
    for (const other of el.querySelectorAll<HTMLElement>('[data-sq][tabindex="0"]')) other.tabIndex = -1;
    square.tabIndex = 0;
  });
  el.addEventListener('keydown', (e) => {
    const delta: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const d = delta[e.key];
    const current = (e.target as HTMLElement).closest<HTMLElement>('[data-sq]');
    if (!d || !current) return;
    const buttons = [...el.querySelectorAll<HTMLElement>('[data-sq]')];
    const index = buttons.indexOf(current);
    const x = Math.min(7, Math.max(0, (index % 8) + d[0]));
    const y = Math.min(7, Math.max(0, Math.floor(index / 8) + d[1]));
    buttons[y * 8 + x]?.focus();
    e.preventDefault();
  });
}

export interface Arrow {
  uci: string;
  primary: boolean;
}

function arrowShape(uci: string, orient: Color, color: string, width: number): string {
  const a = xy(uci.slice(0, 2), orient);
  const b = xy(uci.slice(2, 4), orient);
  const x1 = a.x + 0.5;
  const y1 = a.y + 0.5;
  const x2 = b.x + 0.5;
  const y2 = b.y + 0.5;
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (!len) return '';
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const head = 0.36;
  const hw = width * 1.7;
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  const px = -uy;
  const py = ux;
  const sx = x1 + ux * 0.18;
  const sy = y1 + uy * 0.18;
  const f = (n: number) => n.toFixed(3);
  return (
    `<line x1="${f(sx)}" y1="${f(sy)}" x2="${f(bx)}" y2="${f(by)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>` +
    `<polygon fill="${color}" points="${f(x2)},${f(y2)} ${f(bx + (px * hw) / 2)},${f(by + (py * hw) / 2)} ${f(bx - (px * hw) / 2)},${f(by - (py * hw) / 2)}"/>`
  );
}

export function renderArrows(svg: SVGElement, orient: Color, arrows: readonly Arrow[]): void {
  // Secondary arrows first so the best move is drawn on top.
  svg.innerHTML = [...arrows]
    .sort((a, b) => Number(a.primary) - Number(b.primary))
    .map((a) =>
      a.primary ? arrowShape(a.uci, orient, 'var(--arrow)', 0.17) : arrowShape(a.uci, orient, 'var(--arrow-2)', 0.13),
    )
    .join('');
}

/** The board the promotion picker covers: its sibling in the board box. */
function boardUnder(box: HTMLElement): HTMLElement | null {
  return box.parentElement?.querySelector<HTMLElement>('.board') ?? null;
}

/**
 * Shows the promotion picker over the board. `onPick` receives null when cancelled. The board is inert meanwhile, so
 * the picker is modal: no other move can be made, by mouse or keyboard, while the choice is open.
 */
export function askPromotion(box: HTMLElement, color: Color, onPick: (piece: PromotionPiece | null) => void): void {
  const pieces: PromotionPiece[] = ['q', 'r', 'b', 'n'];
  box.innerHTML =
    '<div class="promo-box" role="dialog" aria-label="Promote to"><p>Promote to</p><div class="promo-row">' +
    pieces
      .map((p) => `<button type="button" data-p="${p}" aria-label="${NAME[p]}">${pieceImg(color, p)}</button>`)
      .join('') +
    '</div><button class="btn" type="button" data-p="">Cancel</button></div>';
  box.hidden = false;
  const board = boardUnder(box);
  if (board) board.inert = true;
  box.onclick = (e) => {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-p]');
    if (!button) return;
    closePromotion(box);
    onPick((button.dataset.p || null) as PromotionPiece | null);
  };
  box.querySelector<HTMLElement>('[data-p="q"]')?.focus();
}

export function closePromotion(box: HTMLElement): void {
  const board = boardUnder(box);
  if (board) board.inert = false;
  box.hidden = true;
  box.onclick = null;
  box.innerHTML = '';
}
