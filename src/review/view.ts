import { Chess, type Color } from 'chess.js';
import type { Arrow } from '../board/board';
import { Engine, STOCKFISH_URL } from '../engine/engine';
import { showOpening } from '../openings/view';
import { loadReviewCache, saveReviewCache } from '../state';
import { escapeHtml } from '../util/html';
import { numberMoves } from '../util/san';
import { formatScore, toWhitePov } from '../util/score';
import { parseUciMove } from '../util/uci';
import {
  JUDGEMENT_SYMBOL,
  reviewGame,
  summarise,
  whiteChances,
  type Judgement,
  type MoveReview,
  type PositionEval,
  type SideSummary,
} from './classify';
import { graphMarkup, positionAt } from './graph';
import { cacheKey, gamePositions, ReviewRunner, type GamePosition, type ReviewJob } from './runner';

/**
 * Search limit per position. A node count, unlike a time, gives the same result on every device; unlike a depth,
 * it takes about as long in every position. 400k nodes take about 0.35 s on a recent laptop.
 */
const REVIEW_GO = 'nodes 400000';

const COLOR_NAME: Record<Color, string> = { w: 'White', b: 'Black' };
const JUDGEMENT_NAME: Record<Judgement, string> = {
  inaccuracy: 'an inaccuracy',
  mistake: 'a mistake',
  blunder: 'a blunder',
};
const JUDGEMENT_PLURAL: Record<Judgement, string> = {
  inaccuracy: 'inaccuracies',
  mistake: 'mistakes',
  blunder: 'blunders',
};
const JUDGEMENTS: readonly Judgement[] = ['inaccuracy', 'mistake', 'blunder'];

export interface ReviewGame {
  startFen: string;
  /** The moves in UCI notation. */
  moves: string[];
  /** The side the user played, for "you" in the texts. */
  you: Color;
  /** Who the other side is: "The computer" in play mode, "Your opponent" otherwise. */
  them: string;
}

export interface ReviewElements {
  panel: HTMLElement;
  title: HTMLElement;
  /** The opening reached by the shown move, under the title. */
  opening: HTMLElement;
  move: HTMLElement;
  detail: HTMLElement;
  nav: HTMLElement;
  graph: SVGElement;
  progress: HTMLProgressElement;
  progressText: HTMLElement;
  /** The summary table's body: one row per side. */
  summary: HTMLElement;
  live: HTMLElement;
  moves: HTMLElement;
}

/**
 * Review mode: the engine evaluates every position of a finished game, and the user steps through it with the
 * mistakes marked. Owns the review panel and, while open, the move list. The app asks it what the board, the arrows
 * and the eval bar show.
 */
export class Review {
  private readonly cache = loadReviewCache();
  private game: ReviewGame | null = null;
  private positions: GamePosition[] = [];
  private sans: string[] = [];
  private runner: ReviewRunner | null = null;
  private engine: Engine<ReviewJob> | null = null;
  private engineFailed = false;
  private reviews: Array<MoveReview | undefined> = [];
  private cursor = 0;
  private boardCache: { index: number; game: Chess } | null = null;
  private announcedDone = false;

  constructor(
    private readonly el: ReviewElements,
    private readonly onChange: () => void,
  ) {
    el.nav.addEventListener('click', (e) => {
      const nav = (e.target as HTMLElement).closest<HTMLElement>('button[data-nav]')?.dataset.nav;
      if (nav) this.navigate(nav);
    });
    el.moves.addEventListener('click', (e) => {
      const index = (e.target as HTMLElement).closest<HTMLElement>('button[data-i]')?.dataset.i;
      if (this.active && index !== undefined) this.goTo(Number(index));
    });
    el.graph.addEventListener('click', (e) => {
      const box = el.graph.getBoundingClientRect();
      if (box.width) this.goTo(positionAt((e.clientX - box.left) / box.width, this.positions.length));
    });
    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  get active(): boolean {
    return this.game !== null;
  }

  open(game: ReviewGame): void {
    this.close();
    this.game = game;
    this.positions = gamePositions(game.startFen, game.moves);
    const replay = new Chess(game.startFen);
    this.sans = game.moves.slice(0, this.positions.length - 1).map((uci) => {
      const move = parseUciMove(uci);
      return move ? replay.move(move).san : uci;
    });
    this.cursor = this.positions.length - 1;
    this.engineFailed = false;
    this.announcedDone = false;

    const engine = new Engine<ReviewJob>({
      url: STOCKFISH_URL,
      onInfo: (job, info) => this.runner?.handleInfo(job, info),
      onBestMove: (job, move) => this.runner?.handleBestMove(job, move),
      onStatus: (status) => {
        if (status !== 'failed') return;
        this.engineFailed = true;
        this.render();
      },
    });
    const runner = new ReviewRunner(engine, this.positions, REVIEW_GO, this.cache, () => this.onResult());
    this.engine = engine;
    this.runner = runner;
    this.updateReviews();
    if (!runner.finished) {
      engine.start();
      runner.start();
    }
    this.el.panel.hidden = false;
    this.render();
  }

  close(): void {
    if (!this.game) return;
    this.runner?.cancel();
    this.engine?.terminate();
    this.runner = null;
    this.engine = null;
    this.game = null;
    this.boardCache = null;
    this.el.panel.hidden = true;
  }

  /** The position the board shows. */
  get board(): Chess {
    if (this.boardCache?.index !== this.cursor) {
      const game = new Chess(this.game?.startFen);
      for (const uci of this.game?.moves.slice(0, this.cursor) ?? []) {
        const move = parseUciMove(uci);
        if (move) game.move(move);
      }
      this.boardCache = { index: this.cursor, game };
    }
    return this.boardCache.game;
  }

  /** For a marked move, the better move, drawn on the position after it. */
  get arrows(): Arrow[] {
    const r = this.reviews[this.cursor - 1];
    return r?.judgement && r.best ? [{ uci: r.best, primary: true }] : [];
  }

  /** White's share of the eval bar in percent and its tooltip, or null while the position is not evaluated. */
  get bar(): { percent: number; label: string } | null {
    const evaluation = this.runner?.evals[this.cursor];
    const position = this.positions[this.cursor];
    if (!evaluation || !position) return null;
    return {
      percent: 50 + 50 * whiteChances(evaluation, position.turn),
      label: `Evaluation ${formatScore(toWhitePov(evaluation.score, position.turn))} (White’s view)`,
    };
  }

  // ---------- navigation ----------

  private goTo(index: number): void {
    const target = Math.max(0, Math.min(this.positions.length - 1, index));
    if (target === this.cursor) return;
    this.cursor = target;
    this.render();
    this.onChange();
  }

  private navigate(nav: string): void {
    if (nav === 'first') this.goTo(0);
    else if (nav === 'prev') this.goTo(this.cursor - 1);
    else if (nav === 'next') this.goTo(this.cursor + 1);
    else if (nav === 'last') this.goTo(this.positions.length - 1);
    else if (nav === 'mistake') {
      const next = this.nextMarked();
      if (next !== null) this.goTo(next);
    }
  }

  /** The position after the next marked move, starting over from the beginning after the last one. */
  private nextMarked(): number | null {
    const marked = this.reviews.flatMap((r, i) => (r?.judgement ? [i + 1] : []));
    return marked.find((p) => p > this.cursor) ?? marked[0] ?? null;
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.active || e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target instanceof Element ? e.target : document.body;
    // The board uses the arrow keys to move between squares, and text fields need them too.
    if (target.closest('input, textarea, select, [contenteditable], .board, .promo')) return;
    const nav = { ArrowLeft: 'prev', ArrowRight: 'next', Home: 'first', End: 'last' }[e.key];
    if (!nav) return;
    e.preventDefault();
    const inList = this.el.moves.contains(target);
    this.navigate(nav);
    if (inList) this.el.moves.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
  }

  // ---------- results ----------

  private onResult(): void {
    if (!this.game || !this.runner) return;
    this.updateReviews();
    const entries = this.positions.flatMap((p): Array<[string, PositionEval]> => {
      const key = cacheKey(REVIEW_GO, p.fen);
      const value = this.cache.get(key);
      return value ? [[key, value]] : [];
    });
    saveReviewCache(entries);
    this.render();
    this.onChange();
  }

  private updateReviews(): void {
    const start = this.positions[0];
    if (!this.game || !this.runner || !start) return;
    this.reviews = reviewGame(start.turn, this.game.moves.slice(0, this.sans.length), this.runner.evals);
  }

  private who(color: Color): string {
    if (!this.game) return COLOR_NAME[color];
    return color === this.game.you ? 'You' : this.game.them;
  }

  // ---------- rendering ----------

  private render(): void {
    if (!this.game || !this.runner) return;
    this.renderMove();
    this.renderNav();
    this.renderProgress();
    this.renderSummary();
    this.renderMoves();
    this.el.graph.innerHTML = graphMarkup(
      this.positions.map((p, i) => {
        const evaluation = this.runner?.evals[i];
        return evaluation ? whiteChances(evaluation, p.turn) : undefined;
      }),
      this.reviews.map((r) => r?.judgement),
      this.cursor,
    );
  }

  private renderMove(): void {
    const { title, move, detail } = this.el;
    showOpening(this.el.opening, this.game?.startFen ?? '', this.sans.slice(0, this.cursor));
    const index = this.cursor - 1;
    const san = this.sans[index];
    const before = this.positions[index];
    if (index < 0 || san === undefined || !before) {
      title.textContent = 'Start position';
      move.textContent = this.sans.length ? 'Step through the game' : 'No moves to review';
      move.className = 'best-san wait';
      detail.textContent = 'Use the buttons, the arrow keys or the move list. Marked moves lost winning chances.';
      return;
    }
    const r = this.reviews[index];
    const judgement = r?.judgement;
    const you = before.turn === this.game?.you ? ' (you)' : '';
    title.textContent = `Move ${before.fen.split(' ')[5] ?? ''}, ${COLOR_NAME[before.turn]}${you}`;
    move.textContent = judgement ? san + JUDGEMENT_SYMBOL[judgement] : san;
    move.className = judgement ? `best-san ${judgement}` : 'best-san';
    if (r) detail.textContent = this.moveText(r, san, before.fen) + this.outcomeText();
    else detail.textContent = this.engineFailed ? 'The engine could not start.' : 'Analysing this move…';
  }

  /** What the review says about a move: its judgement, or that it was good, and the engine's choice. */
  private moveText(r: MoveReview, san: string, fenBefore: string): string {
    const best = r.best ? this.sanOf(fenBefore, r.best) : null;
    if (r.judgement) {
      const text = `${this.who(r.color)} played ${san}, ${JUDGEMENT_NAME[r.judgement]}.`;
      return best ? `${text} Better was ${best}, shown by the arrow.` : text;
    }
    if (r.played === r.best) return 'The engine’s first choice.';
    return best ? `A good move. The engine preferred ${best}.` : 'A good move.';
  }

  /** How the game stands after the shown move, with a leading space, or nothing while it is not evaluated. */
  private outcomeText(): string {
    const after = this.runner?.evals[this.cursor];
    const position = this.positions[this.cursor];
    if (!after || !position) return '';
    if (position.final) return after.score.kind === 'mate' ? ' Checkmate.' : ' The game is drawn.';
    return ` Evaluation after it: ${formatScore(toWhitePov(after.score, position.turn))}.`;
  }

  /** The move list entry for move `index`; clicking it shows the position after the move. */
  private moveButton(index: number, san: string): string {
    const j = this.reviews[index]?.judgement;
    const current = this.cursor === index + 1;
    const fen = this.positions[index]?.fen.split(' ') ?? [];
    const dots = fen[1] === 'b' ? '…' : '.';
    const label = j ? `${fen[5] ?? ''}${dots} ${san}, ${j}` : `${fen[5] ?? ''}${dots} ${san}`;
    const classes = ['m', j, current ? 'cur' : ''].filter(Boolean).join(' ');
    const attrs = current ? ' aria-current="true"' : '';
    const mark = j ? `<span class="mark" aria-hidden="true">${JUDGEMENT_SYMBOL[j]}</span>` : '';
    return (
      `<button type="button" class="${classes}" data-i="${index + 1}" aria-label="${escapeHtml(label)}"${attrs}>` +
      `${escapeHtml(san)}${mark}</button>`
    );
  }

  private sanOf(fen: string, uci: string): string {
    const move = parseUciMove(uci);
    try {
      return move ? new Chess(fen).move(move).san : uci;
    } catch {
      return uci;
    }
  }

  private renderNav(): void {
    const last = this.positions.length - 1;
    this.el.nav.querySelectorAll<HTMLButtonElement>('button[data-nav]').forEach((b) => {
      const nav = b.dataset.nav;
      if (nav === 'first' || nav === 'prev') b.disabled = this.cursor === 0;
      else if (nav === 'next' || nav === 'last') b.disabled = this.cursor === last;
      else b.disabled = this.nextMarked() === null;
    });
  }

  private renderProgress(): void {
    const runner = this.runner;
    if (!runner) return;
    const { progress, progressText, live } = this.el;
    const finished = runner.finished;
    progress.max = runner.total;
    progress.value = runner.done;
    progress.hidden = finished || this.engineFailed;
    if (this.engineFailed) progressText.textContent = 'The engine could not start. Reload the page to try again.';
    else if (finished) progressText.textContent = 'Every move analysed.';
    else progressText.textContent = `Analysing position ${runner.done + 1} of ${runner.total}…`;

    if (finished && !this.announcedDone) {
      this.announcedDone = true;
      const s = summarise(this.reviews);
      const counts = (c: Color) => `${this.who(c)}: ${this.countsText(s[c])}`;
      live.textContent = `Review finished. ${counts(this.game?.you ?? 'w')}. ${counts(this.game?.you === 'b' ? 'w' : 'b')}.`;
    }
  }

  private countsText(s: SideSummary): string {
    const parts = JUDGEMENTS.map((j) => `${s[j]} ${s[j] === 1 ? j : JUDGEMENT_PLURAL[j]}`);
    const accuracy = s.accuracy === null ? '' : `, accuracy ${Math.round(s.accuracy)}%`;
    return parts.join(', ') + accuracy;
  }

  private renderSummary(): void {
    const s = summarise(this.reviews);
    const order: Color[] = this.game?.you === 'b' ? ['b', 'w'] : ['w', 'b'];
    const rows = order.map((c) => this.summaryRow(c, s[c])).join('');
    this.el.summary.innerHTML = rows;
  }

  private summaryRow(color: Color, row: SideSummary): string {
    const accuracy = row.accuracy === null ? '–' : `${Math.round(row.accuracy)}%`;
    const side = `<span class="side">(${COLOR_NAME[color]})</span>`;
    const counts = JUDGEMENTS.map((j) => `<td>${row[j]}</td>`).join('');
    return `<tr><th scope="row">${escapeHtml(this.who(color))} ${side}</th><td>${accuracy}</td>${counts}</tr>`;
  }

  private renderMoves(): void {
    const el = this.el.moves;
    const start = this.positions[0];
    if (!start || !this.sans.length) {
      el.innerHTML = '<span class="empty">No moves yet.</span>';
      return;
    }
    let html = '';
    const numbered = numberMoves(start.fen, this.sans);
    if (start.turn === 'b')
      html += `<span class="n">${numbered[0]?.label.replace('…', '.')}</span><span class="m">…</span>`;
    numbered.forEach((m, i) => {
      if (m.label.endsWith('.')) html += `<span class="n">${m.label}</span>`;
      html += this.moveButton(i, m.san);
    });
    el.innerHTML = html;
    const cur = el.querySelector<HTMLElement>('.cur');
    if (cur) {
      // Keep the current move visible without scrolling the page itself.
      const top = cur.offsetTop - el.offsetTop;
      if (top < el.scrollTop) el.scrollTop = top - 8;
      else if (top + cur.offsetHeight > el.scrollTop + el.clientHeight)
        el.scrollTop = top + cur.offsetHeight - el.clientHeight + 8;
    } else {
      el.scrollTop = 0;
    }
  }
}
