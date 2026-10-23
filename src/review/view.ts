import { Chess, type Color } from 'chess.js';
import type { Arrow } from '../board/board';
import { Engine, STOCKFISH_URL } from '../engine/engine';
import { showOpening } from '../openings/view';
import { loadReviewCache, saveReviewCache } from '../state';
import { escapeHtml } from '../util/html';
import { parseTypedMove } from '../util/moves';
import { numberMoves } from '../util/san';
import { formatScore, toWhitePov } from '../util/score';
import { parseUciMove, toUci, type UciMove } from '../util/uci';
import {
  JUDGEMENT_SYMBOL,
  nextMistake,
  reviewGame,
  summarise,
  whiteChances,
  type Judgement,
  type MoveReview,
  type PositionEval,
  type SideSummary,
} from './classify';
import { describeMove, JUDGEMENT_NAME, moveFacts, spellScore } from './describe';
import { graphMarkup, positionAt } from './graph';
import { isGoodAnswer, positionAfter, retryItems, RetryRun } from './retry';
import { cacheKey, gamePositions, ReviewRunner, reviewWorkerCount, type GamePosition, type ReviewJob } from './runner';

/**
 * Search limit per position. A node count, unlike a time, gives the same result on every device; unlike a depth,
 * it takes about as long in every position. 400k nodes take about 0.35 s on a recent laptop.
 */
const REVIEW_GO = 'nodes 400000';

const COLOR_NAME: Record<Color, string> = { w: 'White', b: 'Black' };
const JUDGEMENT_PLURAL: Record<Judgement, string> = {
  inaccuracy: 'inaccuracies',
  mistake: 'mistakes',
  blunder: 'blunders',
};
const JUDGEMENTS: readonly Judgement[] = ['inaccuracy', 'mistake', 'blunder'];
/** Where focus goes when a step button is disabled while focused: the step in the other direction. */
const NAV_BACK: Record<string, string> = { first: 'next', prev: 'next', next: 'prev', last: 'prev' };

export interface ReviewGame {
  startFen: string;
  /** The moves in UCI notation. */
  moves: string[];
  /** The side the user played: listed first, and the side whose mistakes are practised. */
  you: Color;
  /** A game against the computer, where the texts say "You" and "The computer"; otherwise they name the colours. */
  vsComputer: boolean;
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
  /** "Practise my mistakes", under the summary once the review is finished and the user has some. */
  practiceStart: HTMLButtonElement;
  /** The practice controls: a live message, a form to type the move, and buttons marked `data-practice`. */
  practice: HTMLElement;
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
  private engines: Array<Engine<ReviewJob>> = [];
  private engineFailed = false;
  private reviews: Array<MoveReview | undefined> = [];
  private cursor = 0;
  private boardCache: { index: number; game: Chess } | null = null;
  private announcedDone = false;
  /** The practice run over the user's mistakes, while one is open. */
  private practice: RetryRun | null = null;
  /** The answer whose position is being searched because the review never searched it. */
  private checking: { uci: string; runner: ReviewRunner } | null = null;
  private practiceMessage = '';
  /** The review position to go back to when the practice ends. */
  private reviewCursor = 0;

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
      if (this.active && !this.practice && index !== undefined) this.goTo(Number(index));
    });
    el.graph.addEventListener('click', (e) => {
      const box = el.graph.getBoundingClientRect();
      if (box.width) this.goTo(positionAt((e.clientX - box.left) / box.width, this.positions.length));
    });
    el.practiceStart.addEventListener('click', () => this.startPractice());
    el.practice.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('button[data-practice]')?.dataset.practice;
      if (action) this.onPracticeAction(action);
    });
    el.practice.querySelector('form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.onTypedAnswer();
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

    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const engines = Array.from({ length: reviewWorkerCount(navigator.hardwareConcurrency, memory) }, () => {
      const engine: Engine<ReviewJob> = new Engine<ReviewJob>({
        url: STOCKFISH_URL,
        onInfo: (job, info) => {
          this.runner?.handleInfo(job, info);
          this.checking?.runner.handleInfo(job, info);
        },
        onBestMove: (job, move) => {
          this.runner?.handleBestMove(job, move);
          this.checking?.runner.handleBestMove(job, move);
        },
        onStatus: (status) => {
          if (status === 'failed') this.onEngineFailed(engine);
        },
      });
      return engine;
    });
    const runner = new ReviewRunner(engines, this.positions, REVIEW_GO, this.cache, () => this.onResult());
    this.engines = engines;
    this.runner = runner;
    this.updateReviews();
    if (!runner.finished) {
      engines.forEach((e) => e.start());
      runner.start();
    }
    this.el.panel.hidden = false;
    this.render();
  }

  close(): void {
    if (!this.game) return;
    this.endPractice();
    this.runner?.cancel();
    this.engines.forEach((e) => e.terminate());
    this.runner = null;
    this.engines = [];
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

  /** While practising, the side the user played, so the board is seen from their side; otherwise null. */
  get orient(): Color | null {
    return this.practice ? (this.game?.you ?? null) : null;
  }

  /** Whether the board takes moves: while practising, until the current position is answered well. */
  get acceptsMoves(): boolean {
    return this.practice?.item !== undefined && !this.practice.answered && !this.checking;
  }

  /** The status line above the board, as HTML. */
  get status(): string {
    return this.practice
      ? 'Practise your mistakes<small>Find a better move in each position where you went wrong.</small>'
      : 'Game review<small>Step through the moves with the buttons or the arrow keys, or jump to the next mistake.</small>';
  }

  /** For a marked move, the better move, drawn on the position after it; while practising, the best move once found or shown. */
  get arrows(): Arrow[] {
    if (this.practice) {
      const item = this.practice.item;
      const show = item && (this.practice.answered || this.practice.bestShown);
      return show ? [{ uci: item.best, primary: true }] : [];
    }
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
      const next = nextMistake(this.reviews, this.cursor);
      if (next !== null) this.goTo(next);
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.active || this.practice || e.altKey || e.ctrlKey || e.metaKey) return;
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

  /** The others carry on without a failed engine; the review only stops when none is left. */
  private onEngineFailed(engine: Engine<ReviewJob>): void {
    this.runner?.removeEngine(engine);
    this.checking?.runner.removeEngine(engine);
    if (this.engines.some((e) => e.status !== 'failed')) return;
    this.engineFailed = true;
    if (this.checking) {
      this.checking = null;
      this.practice?.answer(false);
      this.practiceMessage = 'The engine could not check that move. Show the best move, or skip this one.';
    }
    this.render();
  }

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

  // ---------- practice ----------

  /** The user's mistakes and blunders, once every move has been analysed. */
  private get practiceItems() {
    if (!this.game || !this.runner?.finished) return [];
    return retryItems(this.reviews, this.positions, this.game.you);
  }

  private startPractice(): void {
    const items = this.practiceItems;
    if (!items.length) return;
    this.practice = new RetryRun(items);
    this.reviewCursor = this.cursor;
    this.el.panel.classList.add('practising');
    this.showItem();
    this.el.practice.focus();
  }

  /** Back to the review, on the position it showed before the practice. */
  private stopPractice(): void {
    this.endPractice();
    this.cursor = this.reviewCursor;
    this.render();
    this.onChange();
    this.el.practiceStart.focus();
  }

  private endPractice(): void {
    this.checking?.runner.cancel();
    this.checking = null;
    this.practice = null;
    this.el.panel.classList.remove('practising');
    this.el.practice.hidden = true;
  }

  /** Shows the position before the current mistake, or the result once the run is over. */
  private showItem(): void {
    const run = this.practice;
    if (!run) return;
    const item = run.item;
    if (item) {
      this.cursor = item.index;
      const played = this.sans[item.index] ?? item.played;
      this.practiceMessage =
        `${run.current + 1} of ${run.total}: in the game you played ${played} here, ${JUDGEMENT_NAME[item.judgement]}. ` +
        'Play a better move on the board, or type it.';
    } else {
      const all = run.found === run.total ? ' Well done.' : '';
      this.practiceMessage = `You found ${run.found} of ${run.total}.${all} Go back to the review to look again.`;
    }
    this.render();
    this.onChange();
  }

  private onPracticeAction(action: string): void {
    const run = this.practice;
    if (action === 'done') return this.stopPractice();
    if (!run) return;
    if (action === 'best') {
      run.showBest();
      const item = run.item;
      if (item) this.practiceMessage = `The best move is ${this.sanOf(item.fen, item.best)}, shown by the arrow.`;
      this.render();
      this.onChange();
    } else if (action === 'next' || action === 'skip') {
      this.checking?.runner.cancel();
      this.checking = null;
      run.next();
      this.showItem();
    }
    // A button that hides under the user drops focus to the page; keep it in the practice controls.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.hidden) this.el.practice.focus();
  }

  private onTypedAnswer(): void {
    const item = this.practice?.item;
    const input = this.el.practice.querySelector('input');
    const raw = input?.value.trim() ?? '';
    if (!item || !input || !raw || !this.acceptsMoves) return;
    const move = parseTypedMove(item.fen, raw);
    if (!move) {
      this.practiceMessage = `“${raw}” is not a legal move here.`;
      this.render();
      return;
    }
    input.value = '';
    this.answer(move);
  }

  /**
   * Judges a move played while practising. A position the review never searched is searched now, with the review's
   * settings on its engines, which are idle: the practice only starts once the review itself is finished.
   */
  answer(move: UciMove): void {
    const item = this.practice?.item;
    const before = item ? this.runner?.evals[item.index] : undefined;
    const uci = toUci(move);
    const after = item ? positionAfter(item.fen, uci) : null;
    if (!item || !before || !after || !this.acceptsMoves) return;
    if (uci === item.best) return this.judge(uci, true);
    const known = after.final ?? this.cache.get(cacheKey(REVIEW_GO, after.fen));
    if (known) return this.judge(uci, isGoodAnswer(item, uci, before, known));
    const runner = new ReviewRunner(this.engines, [after], REVIEW_GO, this.cache, () => this.onChecked());
    this.checking = { uci, runner };
    this.engines.forEach((e) => e.start());
    runner.start();
    this.practiceMessage = `Checking ${this.sanOf(item.fen, uci)}…`;
    this.render();
  }

  private onChecked(): void {
    const check = this.checking;
    const item = this.practice?.item;
    const before = item ? this.runner?.evals[item.index] : undefined;
    const after = check?.runner.evals[0];
    if (!check || !item || !before || !after) return;
    this.checking = null;
    this.judge(check.uci, isGoodAnswer(item, check.uci, before, after));
  }

  private judge(uci: string, good: boolean): void {
    const run = this.practice;
    const item = run?.item;
    if (!run || !item) return;
    run.answer(good);
    const san = this.sanOf(item.fen, uci);
    const played = this.sans[item.index] ?? item.played;
    if (!good) this.practiceMessage = `${san}: not quite, try again.`;
    else if (uci === item.best)
      this.practiceMessage = `Good: ${san} is the engine’s best move. In the game you played ${played}.`;
    else {
      const best = this.sanOf(item.fen, item.best);
      this.practiceMessage = `Good: ${san} keeps your chances. In the game you played ${played}; the engine’s best move is ${best}, shown by the arrow.`;
    }
    this.render();
    this.onChange();
  }

  private who(color: Color): string {
    if (!this.game?.vsComputer) return COLOR_NAME[color];
    return color === this.game.you ? 'You' : 'The computer';
  }

  // ---------- rendering ----------

  private render(): void {
    if (!this.game || !this.runner) return;
    if (this.practice) this.renderPractice();
    else this.renderMove();
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
    showOpening(this.el.opening, this.game?.startFen ?? '', this.sans.slice(0, this.cursor));
    const detail = this.moveDetail();
    // The detail is a live region and the panel re-renders after every result, so only touch it when it changes.
    if (this.el.detail.textContent !== detail) this.el.detail.textContent = detail;
  }

  /** Sets the title and the move of the panel, and returns the detail text below them. */
  private moveDetail(): string {
    const { title, move } = this.el;
    const index = this.cursor - 1;
    const san = this.sans[index];
    const before = this.positions[index];
    if (index < 0 || san === undefined || !before) {
      title.textContent = 'Start position';
      move.textContent = this.sans.length ? 'Step through the game' : 'No moves to review';
      move.className = 'best-san wait';
      return 'Use the buttons, the arrow keys or the move list. Marked moves lost winning chances.';
    }
    const r = this.reviews[index];
    const judgement = r?.judgement;
    const you = this.game?.vsComputer && before.turn === this.game.you ? ' (you)' : '';
    title.textContent = `Move ${before.fen.split(' ')[5] ?? ''}, ${COLOR_NAME[before.turn]}${you}`;
    move.textContent = judgement ? san + JUDGEMENT_SYMBOL[judgement] : san;
    move.className = judgement ? `best-san ${judgement}` : 'best-san';
    if (r) return this.moveText(r, san, before.fen);
    return this.engineFailed ? 'The engine could not start.' : 'Analysing this move…';
  }

  /** What the review says about a move (see {@link describeMove}), then how the game stands after it. */
  private moveText(r: MoveReview, san: string, fenBefore: string): string {
    const before = this.runner?.evals[r.index];
    const after = this.runner?.evals[r.index + 1];
    if (!before || !after) return '';
    const facts = moveFacts(fenBefore, r, before, after);
    const best = r.best ? this.sanOf(fenBefore, r.best) : null;
    const text = describeMove(r, facts, { who: this.who(r.color), san, best });
    return facts.checkmate ? text : text + this.outcomeText();
  }

  /** How the game stands after the shown move, with a leading space, or nothing while it is not evaluated. */
  private outcomeText(): string {
    const after = this.runner?.evals[this.cursor];
    const position = this.positions[this.cursor];
    if (!after || !position) return '';
    if (position.final) return after.score.kind === 'mate' ? ' Checkmate.' : ' The game is drawn.';
    return ` Evaluation after it: ${spellScore(toWhitePov(after.score, position.turn))}.`;
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

  private renderPractice(): void {
    const run = this.practice;
    if (!run) return;
    const { title, move, practice } = this.el;
    const item = run.item;
    title.textContent = item ? `Your mistake ${run.current + 1} of ${run.total}` : 'Practice finished';
    move.textContent = item ? 'Find a better move' : `You found ${run.found} of ${run.total}`;
    move.className = this.checking ? 'best-san wait' : 'best-san';
    practice.hidden = false;
    const text = practice.querySelector('p');
    // A live region: only touch it when the message changes.
    if (text && text.textContent !== this.practiceMessage) text.textContent = this.practiceMessage;
    const form = practice.querySelector('form');
    if (form) form.hidden = !item || run.answered;
    for (const button of practice.querySelectorAll<HTMLButtonElement>('button[data-practice]')) {
      const action = button.dataset.practice;
      if (action === 'best') button.hidden = !run.canShowBest;
      else if (action === 'skip') button.hidden = !item || run.answered;
      else if (action === 'next') {
        button.hidden = !item || !run.answered;
        button.textContent = run.current + 1 < run.total ? 'Next' : 'See the result';
      }
    }
  }

  private renderNav(): void {
    const last = this.positions.length - 1;
    const buttons = [...this.el.nav.querySelectorAll<HTMLButtonElement>('button[data-nav]')];
    const focused = buttons.find((b) => b === document.activeElement);
    for (const b of buttons) {
      const nav = b.dataset.nav;
      if (nav === 'first' || nav === 'prev') b.disabled = this.cursor === 0;
      else if (nav === 'next' || nav === 'last') b.disabled = this.cursor === last;
      else b.disabled = nextMistake(this.reviews, this.cursor) === null;
    }
    // A button that gets disabled under the user drops focus to the page; hand it to the step the other way instead.
    if (!focused?.disabled) return;
    const back = NAV_BACK[focused.dataset.nav ?? ''];
    const target = buttons.find((b) => b.dataset.nav === back && !b.disabled) ?? buttons.find((b) => !b.disabled);
    (target ?? this.el.panel).focus();
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

    this.el.practiceStart.hidden = this.practice !== null || this.practiceItems.length === 0;
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
    // Without a computer the row is named by its colour alone.
    const side = this.game?.vsComputer ? ` <span class="side">(${COLOR_NAME[color]})</span>` : '';
    const counts = JUDGEMENTS.map((j) => `<td>${row[j]}</td>`).join('');
    return `<tr><th scope="row">${escapeHtml(this.who(color))}${side}</th><td>${accuracy}</td>${counts}</tr>`;
  }

  private renderMoves(): void {
    const el = this.el.moves;
    const start = this.positions[0];
    if (!start || !this.sans.length) {
      el.innerHTML = '<span class="empty">No moves yet.</span>';
      return;
    }
    // The list is rebuilt after every step and every result; keep focus on the move that had it, so picking a move
    // with Enter or Space, or reading the list while the review runs, does not drop focus to the page.
    const focused = el.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.i : undefined;
    let html = '';
    const numbered = numberMoves(start.fen, this.sans);
    if (start.turn === 'b')
      html += `<span class="n">${numbered[0]?.label.replace('…', '.')}</span><span class="m">…</span>`;
    numbered.forEach((m, i) => {
      if (m.label.endsWith('.')) html += `<span class="n">${m.label}</span>`;
      html += this.moveButton(i, m.san);
    });
    el.innerHTML = html;
    if (focused) el.querySelector<HTMLElement>(`button[data-i="${focused}"]`)?.focus({ preventScroll: true });
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
