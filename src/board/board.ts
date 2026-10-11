import type { Chess, Color, PieceSymbol, Square } from 'chess.js';
import type { PromotionPiece } from '../util/uci';

const FILES = 'abcdefgh';
const NAME: Record<PieceSymbol, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const PIECE_BASE = `${import.meta.env.BASE_URL}pieces/cburnett/`;

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
}

export function renderBoard(el: HTMLElement, view: BoardView): void {
  const { game, orient, selected } = view;
  const focused = el.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.sq : undefined;
  const history = game.history({ verbose: true });
  const last = history[history.length - 1];
  const targets = new Map<string, boolean>();
  if (selected) {
    for (const m of game.moves({ square: selected, verbose: true })) targets.set(m.to, m.isCapture());
  }
  const checkSquare = game.inCheck() ? game.findPiece({ type: 'k', color: game.turn() })[0] : undefined;

  let html = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const sq = squareAt(x, y, orient);
      const rank = Number(sq[1]);
      const piece = game.get(sq);
      let cls = `sq ${squareColor(sq)}`;
      if (last && (last.from === sq || last.to === sq)) cls += ' last';
      if (selected === sq) cls += ' sel';
      if (checkSquare === sq) cls += ' check';
      if (targets.has(sq)) cls += ` target${targets.get(sq) ? ' capture' : ''}`;
      let label = sq;
      if (piece) label += `, ${piece.color === 'w' ? 'white' : 'black'} ${NAME[piece.type]}`;
      if (selected === sq) label += ', selected';
      else if (targets.has(sq)) label += ', legal move';
      html += `<button type="button" class="${cls}" data-sq="${sq}" aria-label="${label}">`;
      if (x === 0) html += `<span class="coord rank" aria-hidden="true">${rank}</span>`;
      if (y === 7) html += `<span class="coord file" aria-hidden="true">${sq[0]}</span>`;
      if (piece) html += pieceImg(piece.color, piece.type);
      html += '</button>';
    }
  }
  el.innerHTML = html;
  if (focused) el.querySelector<HTMLElement>(`[data-sq="${focused}"]`)?.focus();
}

/** Arrow keys move focus between squares in screen direction. */
export function enableArrowKeys(el: HTMLElement): void {
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

/** Shows the promotion picker over the board. `onPick` receives null when cancelled. */
export function askPromotion(box: HTMLElement, color: Color, onPick: (piece: PromotionPiece | null) => void): void {
  const pieces: PromotionPiece[] = ['q', 'r', 'b', 'n'];
  box.innerHTML =
    '<div class="promo-box" role="dialog" aria-label="Promote to"><p>Promote to</p><div class="promo-row">' +
    pieces
      .map((p) => `<button type="button" data-p="${p}" aria-label="${NAME[p]}">${pieceImg(color, p)}</button>`)
      .join('') +
    '</div><button class="btn" type="button" data-p="">Cancel</button></div>';
  box.hidden = false;
  box.onclick = (e) => {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-p]');
    if (!button) return;
    closePromotion(box);
    onPick((button.dataset.p || null) as PromotionPiece | null);
  };
  box.querySelector<HTMLElement>('[data-p="q"]')?.focus();
}

export function closePromotion(box: HTMLElement): void {
  box.hidden = true;
  box.onclick = null;
  box.innerHTML = '';
}
