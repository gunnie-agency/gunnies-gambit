import { Chess, DEFAULT_POSITION, type Color, type Square } from 'chess.js';
import { askPromotion, closePromotion, enableArrowKeys, renderArrows, renderBoard, type Arrow } from '../board/board';
import { Engine, STOCKFISH_URL } from '../engine/engine';
import type { EngineInfo } from '../engine/info';
import { LEVELS, levelById } from '../engine/levels';
import type { SearchJob } from '../engine/queue';
import { DEFAULT_SETTINGS, loadSaved, replay, saveGame, settingsOf, type Mode, type Settings } from '../state';
import { fenProblem, gameEnd, parseTypedMove, uniqueMoveTo } from '../util/moves';
import { numberMoves, pvToSan } from '../util/san';
import { evalBarPercent, formatScore, toWhitePov, verdict, type Score } from '../util/score';
import { parseUciMove, toUci, type UciMove } from '../util/uci';

interface Line {
  depth: number;
  score: Score;
  pv: string[];
}

interface MoveJob extends SearchJob {
  requestedAt: number;
}

/** Shortest time between the user's move and the engine's reply, so the reply does not appear to be instant. */
const MIN_REPLY_MS = 600;
/** Search time for hints and engine lines in play mode. */
const PLAY_THINK_MS = 2000;

const COLOR_NAME: Record<Color, string> = { w: 'White', b: 'Black' };

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

export class App {
  private readonly el = {
    board: $('board'),
    arrows: document.getElementById('arrows') as unknown as SVGElement,
    promo: $('promo'),
    evalbar: $('evalbar'),
    evalfill: $('evalfill'),
    status: $('status'),
    chip: $('engineChip'),
    engineName: $('engineName'),
    bestLabel: $('bestLabel'),
    bestSan: $('bestSan'),
    bestMeta: $('bestMeta'),
    playBest: $<HTMLButtonElement>('playBest'),
    hintBtn: $<HTMLButtonElement>('hintBtn'),
    lines: $('lines'),
    moveForm: $<HTMLFormElement>('moveForm'),
    moveInput: $<HTMLInputElement>('moveInput'),
    moveHint: $('moveHint'),
    modeSeg: $('modeSeg'),
    sideSeg: $('sideSeg'),
    thinkSeg: $('thinkSeg'),
    levelSelect: $<HTMLSelectElement>('levelSelect'),
    levelSetting: $('levelSetting'),
    thinkSetting: $('thinkSetting'),
    helpSetting: $('helpSetting'),
    showEval: $<HTMLInputElement>('showEval'),
    showBest: $<HTMLInputElement>('showBest'),
    moves: $('moves'),
    undoBtn: $<HTMLButtonElement>('undoBtn'),
    flipBtn: $<HTMLButtonElement>('flipBtn'),
    newBtn: $<HTMLButtonElement>('newBtn'),
    fenInput: $<HTMLInputElement>('fenInput'),
    pgnInput: $<HTMLTextAreaElement>('pgnInput'),
    loadFen: $<HTMLButtonElement>('loadFen'),
    copyFen: $<HTMLButtonElement>('copyFen'),
    loadPgn: $<HTMLButtonElement>('loadPgn'),
    copyPgn: $<HTMLButtonElement>('copyPgn'),
    toolsHint: $('toolsHint'),
  };

  private game: Chess;
  private startFen: string;
  private settings: Settings;
  private selected: Square | null = null;
  private moveMessage: { text: string; err: boolean } | null = null;

  /** Analysis of the current position (best move, eval, lines). */
  private lines: Line[] = [];
  private analysisDone = false;
  private analysisFen: string | null = null;
  /** Position for which the user asked a hint in play mode. */
  private hintFen: string | null = null;

  private opponentFen: string | null = null;
  private replyTimer: ReturnType<typeof setTimeout> | undefined;
  private renderQueued = false;

  private readonly analysis: Engine;
  private readonly opponent: Engine<MoveJob>;

  constructor() {
    const saved = loadSaved();
    const restored = replay(saved?.startFen ?? DEFAULT_POSITION, saved?.moves ?? []);
    this.game = restored.game;
    this.startFen = restored.startFen;
    this.settings = saved ? settingsOf(saved) : { ...DEFAULT_SETTINGS };

    this.analysis = new Engine({
      url: STOCKFISH_URL,
      init: { MultiPV: 3 },
      onInfo: (job, info) => this.onAnalysisInfo(job, info),
      onBestMove: (job) => this.onAnalysisDone(job),
      onStatus: () => this.onEngineStatus(),
    });
    // A second worker plays the opponent, so its strength limits never affect the analysis.
    this.opponent = new Engine<MoveJob>({
      url: STOCKFISH_URL,
      onBestMove: (job, move) => this.onOpponentMove(job, move),
      onStatus: () => this.onEngineStatus(),
    });

    this.el.levelSelect.innerHTML = LEVELS.map((l) => `<option value="${l.id}">${escapeHtml(l.label)}</option>`).join(
      '',
    );
    this.bindEvents();
    enableArrowKeys(this.el.board);
  }

  start(): void {
    this.analysis.start();
    if (this.settings.mode === 'play') this.opponent.start();
    this.positionChanged();
  }

  // ---------- derived state ----------

  private get fen(): string {
    return this.game.fen();
  }

  private get isOver(): boolean {
    return gameEnd(this.game) !== null;
  }

  /** Whether the user may enter a move for the side to move. */
  private get canInput(): boolean {
    return this.settings.mode === 'analysis' || this.game.turn() === this.settings.side;
  }

  private get isEngineTurn(): boolean {
    return this.settings.mode === 'play' && this.game.turn() !== this.settings.side && !this.isOver;
  }

  /** Whether any analysis output is shown (and so computed) for the current position. */
  private get showAnalysis(): boolean {
    if (this.isOver) return false;
    if (this.settings.mode === 'analysis') return true;
    return this.game.turn() === this.settings.side && (this.evalVisible || this.bestVisible);
  }

  /** Eval bar, score and verdict. Always on in analysis mode, a setting in play mode. */
  private get evalVisible(): boolean {
    return this.settings.mode === 'analysis' || this.settings.showEval;
  }

  /** Best move and its arrow: always in analysis mode; in play mode by setting or for a requested hint. */
  private get bestVisible(): boolean {
    return this.settings.mode === 'analysis' || this.settings.showBest || this.hintFen === this.fen;
  }

  /** The top lines and the second arrow. A hint alone shows only the move. */
  private get linesVisible(): boolean {
    return this.settings.mode === 'analysis' || this.settings.showBest;
  }

  // ---------- engines ----------

  private syncEngines(): void {
    const fen = this.fen;
    if (this.showAnalysis) {
      if (this.analysisFen !== fen) {
        this.analysisFen = fen;
        const ms = this.settings.mode === 'analysis' ? this.settings.think : PLAY_THINK_MS;
        this.analysis.request({ fen, go: `movetime ${ms}` });
      }
    } else if (this.analysisFen !== null) {
      this.analysisFen = null;
      this.analysis.cancel();
    }

    if (this.isEngineTurn) {
      if (this.opponentFen !== fen) {
        this.opponentFen = fen;
        clearTimeout(this.replyTimer);
        const level = levelById(this.settings.level);
        this.opponent.start();
        this.opponent.request({ fen, go: level.go, options: level.options, requestedAt: Date.now() });
      }
    } else if (this.opponentFen !== null) {
      this.opponentFen = null;
      clearTimeout(this.replyTimer);
      this.opponent.cancel();
    }
  }

  /** Forgets the running analysis so the next sync starts a fresh search (e.g. after a think-time change). */
  private restartAnalysis(): void {
    this.lines = [];
    this.analysisDone = false;
    this.analysisFen = null;
  }

  private onAnalysisInfo(job: SearchJob, info: EngineInfo): void {
    if (job.fen !== this.fen) return;
    this.lines[info.multipv - 1] = { depth: info.depth, score: info.score, pv: info.pv };
    this.scheduleRender();
  }

  private onAnalysisDone(job: SearchJob): void {
    if (job.fen !== this.fen) return;
    this.analysisDone = true;
    this.scheduleRender();
  }

  private onOpponentMove(job: MoveJob, move: string | null): void {
    if (job.fen !== this.fen || !this.isEngineTurn) return;
    const parsed = move ? parseUciMove(move) : null;
    if (!parsed) return;
    const wait = Math.max(0, MIN_REPLY_MS - (Date.now() - job.requestedAt));
    clearTimeout(this.replyTimer);
    this.replyTimer = setTimeout(() => {
      if (this.fen === job.fen && this.isEngineTurn) this.playMove(parsed);
    }, wait);
  }

  private onEngineStatus(): void {
    this.renderChip();
    this.scheduleRender();
  }

  // ---------- game actions ----------

  private positionChanged(): void {
    clearTimeout(this.replyTimer);
    this.selected = null;
    this.lines = [];
    this.analysisDone = false;
    this.hintFen = null;
    closePromotion(this.el.promo);
    saveGame(this.game, this.startFen, this.settings);
    this.syncEngines();
    this.render();
  }

  private playMove(move: UciMove): boolean {
    try {
      this.game.move(move);
    } catch {
      return false;
    }
    this.moveMessage = null;
    this.positionChanged();
    return true;
  }

  private tryUserMove(from: Square, to: Square, promotion: boolean): void {
    if (!promotion) {
      this.playMove({ from, to });
      return;
    }
    askPromotion(this.el.promo, this.game.turn(), (piece) => {
      if (piece) this.playMove({ from, to, promotion: piece });
      else {
        this.selected = null;
        this.renderBoardOnly();
      }
      this.focusSquare(piece ? to : from);
    });
  }

  private focusSquare(sq: Square): void {
    this.el.board.querySelector<HTMLElement>(`[data-sq="${sq}"]`)?.focus();
  }

  private onSquare(sq: Square): void {
    const game = this.game;
    if (this.isOver || !this.canInput) return;

    if (this.selected) {
      if (sq === this.selected) {
        this.selected = null;
        this.renderBoardOnly();
        return;
      }
      const candidates = game.moves({ square: this.selected, verbose: true }).filter((m) => m.to === sq);
      if (candidates.length) {
        this.tryUserMove(
          this.selected,
          sq,
          candidates.some((m) => m.promotion),
        );
        return;
      }
    }

    const piece = game.get(sq);
    if (piece && piece.color === game.turn()) {
      this.selected = sq;
      this.renderBoardOnly();
      return;
    }
    if (this.selected) {
      this.selected = null;
      this.renderBoardOnly();
      return;
    }

    // Tapping only the destination plays the move when exactly one piece can go there.
    const unique = uniqueMoveTo(game, sq);
    if (unique) {
      this.tryUserMove(unique.from, unique.to, unique.promotion);
      return;
    }
    this.selected = null;
    if (game.moves({ verbose: true }).some((m) => m.to === sq)) {
      this.moveMessage = { text: `More than one piece can go to ${sq}. Tap the piece first.`, err: false };
      this.renderMoveHint();
    }
    this.renderBoardOnly();
  }

  private undo(): void {
    clearTimeout(this.replyTimer);
    if (!this.game.undo()) return;
    // In play mode, take back the engine's reply too, so it is the user's turn again.
    if (this.settings.mode === 'play' && this.game.turn() !== this.settings.side && this.game.history().length > 0) {
      this.game.undo();
    }
    this.opponentFen = null;
    this.positionChanged();
  }

  private newGame(): void {
    this.game.reset();
    this.startFen = DEFAULT_POSITION;
    this.settings.orient = this.settings.side;
    this.moveMessage = null;
    this.opponentFen = null;
    this.positionChanged();
  }

  private updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    saveGame(this.game, this.startFen, this.settings);
    this.syncEngines();
    this.render();
  }

  // ---------- events ----------

  private bindEvents(): void {
    const el = this.el;
    el.board.addEventListener('click', (e) => {
      const sq = (e.target as HTMLElement).closest<HTMLElement>('[data-sq]')?.dataset.sq;
      if (sq) this.onSquare(sq as Square);
    });

    el.playBest.addEventListener('click', () => {
      const best = this.lines[0]?.pv[0];
      const move = best ? parseUciMove(best) : null;
      if (move && this.showAnalysis && this.canInput) this.playMove(move);
    });
    el.hintBtn.addEventListener('click', () => {
      this.hintFen = this.fen;
      this.syncEngines();
      this.render();
    });

    el.undoBtn.addEventListener('click', () => this.undo());
    el.flipBtn.addEventListener('click', () =>
      this.updateSettings({ orient: this.settings.orient === 'w' ? 'b' : 'w' }),
    );
    el.newBtn.addEventListener('click', () => this.newGame());

    el.moveForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = el.moveInput.value.trim();
      if (!raw) return;
      if (this.isOver) {
        this.moveMessage = { text: 'The game is over. Undo a move or start a new game.', err: true };
      } else if (!this.canInput) {
        this.moveMessage = { text: 'Wait for the computer to move.', err: true };
      } else {
        const move = parseTypedMove(this.fen, raw);
        if (move) {
          const san = new Chess(this.fen).move(move).san;
          el.moveInput.value = '';
          this.playMove(move);
          this.moveMessage = { text: `Added ${san}.`, err: false };
        } else {
          this.moveMessage = {
            text: `“${raw}” is not a legal move here. ${COLOR_NAME[this.game.turn()]} is to move.`,
            err: true,
          };
        }
      }
      this.renderMoveHint();
    });

    const seg = (container: HTMLElement, fn: (value: string) => void) =>
      container.addEventListener('click', (e) => {
        const v = (e.target as HTMLElement).closest<HTMLElement>('button[data-v]')?.dataset.v;
        if (v) fn(v);
      });
    seg(el.modeSeg, (v) => {
      const mode = v as Mode;
      if (mode === this.settings.mode) return;
      this.selected = null;
      this.hintFen = null;
      this.restartAnalysis();
      if (mode === 'play') this.opponent.start();
      this.updateSettings({ mode });
    });
    seg(el.sideSeg, (v) => {
      const side = v as Color;
      if (side === this.settings.side) return;
      this.selected = null;
      this.updateSettings({ side, orient: side });
    });
    seg(el.thinkSeg, (v) => {
      this.restartAnalysis();
      this.updateSettings({ think: Number(v) });
    });
    el.levelSelect.addEventListener('change', () => {
      this.opponentFen = null; // re-search the current position at the new level
      this.updateSettings({ level: el.levelSelect.value });
    });
    el.showEval.addEventListener('change', () => this.updateSettings({ showEval: el.showEval.checked }));
    el.showBest.addEventListener('change', () => this.updateSettings({ showBest: el.showBest.checked }));

    el.loadFen.addEventListener('click', () => {
      const fen = el.fenInput.value.trim();
      const problem = fenProblem(fen);
      if (problem) return this.toolsHint(`That FEN is not valid: ${problem}`, true);
      this.game.load(fen);
      this.startFen = fen;
      this.opponentFen = null;
      this.positionChanged();
      this.toolsHint('Position loaded.');
    });
    el.loadPgn.addEventListener('click', () => {
      const text = el.pgnInput.value.trim();
      if (!text) return this.toolsHint('Paste a PGN first.', true);
      const parsed = new Chess();
      try {
        parsed.loadPgn(text, { strict: false });
      } catch {
        return this.toolsHint('That PGN could not be read. Check that every move is legal.', true);
      }
      const start = parsed.getHeaders().FEN ?? DEFAULT_POSITION;
      const restored = replay(start, parsed.history({ verbose: true }).map(toUci));
      this.game = restored.game;
      this.startFen = restored.startFen;
      this.opponentFen = null;
      this.positionChanged();
      this.toolsHint(`Imported ${this.game.history().length} moves.`);
    });
    el.copyFen.addEventListener('click', () => this.copy(this.fen, 'FEN copied.', el.fenInput));
    el.copyPgn.addEventListener('click', () => this.copy(this.game.pgn(), 'PGN copied.', el.pgnInput));

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const selected = this.selected;
      const promoOpen = !el.promo.hidden;
      if (promoOpen) closePromotion(el.promo);
      this.selected = null;
      this.renderBoardOnly();
      if (promoOpen && selected) this.focusSquare(selected);
    });
  }

  private copy(text: string, ok: string, field: HTMLInputElement | HTMLTextAreaElement): void {
    const fallback = () => {
      field.value = text;
      field.select();
      this.toolsHint('Selected. Press Ctrl+C or ⌘C to copy.');
    };
    if (!navigator.clipboard) return fallback();
    navigator.clipboard.writeText(text).then(() => this.toolsHint(ok), fallback);
  }

  private toolsHint(text: string, err = false): void {
    this.el.toolsHint.textContent = text;
    this.el.toolsHint.className = `hint${err ? ' err' : ''}`;
  }

  // ---------- rendering ----------

  private scheduleRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.renderAnalysis();
      this.renderArrowsOnly();
      this.renderStatus();
    });
  }

  private render(): void {
    this.renderBoardOnly();
    this.renderStatus();
    this.renderAnalysis();
    this.renderMoves();
    this.renderSettings();
    this.renderMoveHint();
    this.renderChip();
    this.el.fenInput.value = this.fen;
    this.el.undoBtn.disabled = this.game.history().length === 0;
  }

  private renderBoardOnly(): void {
    renderBoard(this.el.board, { game: this.game, orient: this.settings.orient, selected: this.selected });
    this.renderArrowsOnly();
  }

  private renderArrowsOnly(): void {
    const arrows: Arrow[] = [];
    const [l1, l2] = this.lines;
    if (this.showAnalysis && this.bestVisible && l1?.pv[0]) {
      arrows.push({ uci: l1.pv[0], primary: true });
      if (this.linesVisible && l2?.pv[0] && l2.pv[0] !== l1.pv[0]) arrows.push({ uci: l2.pv[0], primary: false });
    }
    renderArrows(this.el.arrows, this.settings.orient, arrows);
  }

  private renderStatus(): void {
    const { side, mode } = this.settings;
    const game = this.game;
    const end = gameEnd(game);
    const level = levelById(this.settings.level).label;
    let html: string;
    if (end === 'checkmate') {
      const winner: Color = game.turn() === 'w' ? 'b' : 'w';
      const loser = mode === 'play' ? 'The computer wins.' : 'Your opponent wins.';
      html = `Checkmate. ${winner === side ? 'You win.' : loser}<small>Undo a move to look again, or start a new game.</small>`;
    } else if (end === 'stalemate') html = 'Stalemate. The game is drawn.';
    else if (end === 'threefold') html = 'Draw by threefold repetition.';
    else if (end === 'insufficient') html = 'Draw by insufficient material.';
    else if (end === 'fifty-moves') html = 'Draw by the 50-move rule.';
    else if (mode === 'play') {
      if (this.opponent.status === 'failed')
        html = 'The engine could not start.<small>Reload the page to try again.</small>';
      else if (game.turn() === side)
        html = `Your move${game.inCheck() ? ', and you are in check' : ''}<small>You play ${COLOR_NAME[side]} against the computer (${escapeHtml(level)}).</small>`;
      else html = `The computer is thinking…<small>Level: ${escapeHtml(level)}</small>`;
    } else if (game.turn() === side) {
      html = `Your move${game.inCheck() ? ', and you are in check' : ''}<small>You play ${COLOR_NAME[side]}. Play the suggestion, or enter the move you choose.</small>`;
    } else {
      html = 'Your opponent is to move<small>Enter their move on the board or type it below.</small>';
    }
    if (this.el.status.innerHTML !== html) this.el.status.innerHTML = html;
  }

  private renderAnalysis(): void {
    const el = this.el;
    const { mode, side, showBest } = this.settings;
    const fen = this.fen;
    const l1 = this.lines[0];
    const yours = this.game.turn() === side;
    const showEval = this.evalVisible;

    el.hintBtn.hidden = true;
    el.playBest.hidden = false;
    el.playBest.disabled = true;
    el.playBest.textContent = mode === 'analysis' && !yours ? 'They played this' : 'Play it';
    el.evalbar.classList.toggle('off', !showEval);
    el.lines.classList.toggle('no-score', !showEval);
    const wait = (label: string, text: string, meta = '\u00a0') => {
      el.bestLabel.textContent = label;
      el.bestSan.textContent = text;
      el.bestSan.className = 'best-san wait';
      el.bestMeta.textContent = meta;
      el.lines.innerHTML = '';
    };

    if (this.isOver) {
      wait('Result', 'Game over');
      el.playBest.hidden = true;
      this.setBar(null);
      return;
    }
    if (mode === 'play' && !yours) {
      wait('Opponent', 'Thinking…');
      el.playBest.hidden = true;
      return;
    }

    const depth = l1 ? `depth ${l1.depth}${this.analysisDone ? ' (done)' : ''}` : '';
    const white = l1 ? toWhitePov(l1.score, this.game.turn()) : null;
    const evalMeta = () => {
      if (!white) {
        el.bestMeta.textContent = this.analysis.status === 'failed' ? 'Engine unavailable' : 'Evaluating…';
        return;
      }
      const v = verdict(white, side);
      el.bestMeta.innerHTML = `<b>${formatScore(white)}</b> · <span class="${v.tone}">${v.text}</span> · ${depth}`;
      this.setBar(white);
    };

    if (!this.bestVisible) {
      wait('Hint', 'Need help?', 'A hint shows the best move in this position.');
      el.playBest.hidden = true;
      el.hintBtn.hidden = false;
      el.hintBtn.disabled = this.analysis.status === 'failed';
      if (showEval) evalMeta();
      else this.setBar(null);
      return;
    }

    const label =
      mode === 'play' ? (showBest ? 'Best move' : 'Hint') : yours ? 'Best move for you' : 'Opponent’s strongest reply';
    if (!l1) {
      const text =
        this.analysis.status === 'failed'
          ? 'Engine unavailable'
          : this.analysis.status === 'loading'
            ? 'Engine loading…'
            : 'Thinking…';
      wait(label, text);
      return;
    }

    el.bestLabel.textContent = label;
    el.bestSan.textContent = pvToSan(fen, l1.pv, 1)[0] ?? l1.pv[0] ?? '';
    el.bestSan.className = 'best-san';
    el.playBest.disabled = false;

    if (showEval) evalMeta();
    else el.bestMeta.textContent = `Engine suggestion, ${depth}`;

    if (!this.linesVisible) {
      el.lines.innerHTML = '';
      return;
    }
    el.lines.innerHTML = this.lines
      .filter((ln): ln is Line => Boolean(ln))
      .map((ln) => {
        const moves = numberMoves(fen, pvToSan(fen, ln.pv, 9))
          .map((m, i) => `${m.label ? `${m.label} ` : ''}${i === 0 ? `<b>${m.san}</b>` : m.san}`)
          .join(' ');
        const score = showEval
          ? `<span class="score">${formatScore(toWhitePov(ln.score, this.game.turn()))}</span>`
          : '';
        return `<li>${score}<span class="pv">${moves}</span></li>`;
      })
      .join('');
  }

  private setBar(white: Score | null): void {
    this.el.evalfill.style.height = `${evalBarPercent(white).toFixed(1)}%`;
    this.el.evalbar.classList.toggle('flipped', this.settings.orient === 'b');
    this.el.evalbar.title = white ? `Evaluation ${formatScore(white)} (White’s view)` : 'Evaluation';
  }

  private renderMoves(): void {
    const sans = this.game.history();
    const el = this.el.moves;
    if (!sans.length) {
      el.innerHTML = '<span class="empty">No moves yet.</span>';
      return;
    }
    let html = '';
    const numbered = numberMoves(this.startFen, sans);
    if (this.startFen.split(' ')[1] === 'b')
      html += `<span class="n">${numbered[0]?.label.replace('…', '.')}</span><span class="m">…</span>`;
    numbered.forEach((m, i) => {
      if (m.label.endsWith('.')) html += `<span class="n">${m.label}</span>`;
      html += `<span class="m${i === sans.length - 1 ? ' cur' : ''}">${m.san}</span>`;
    });
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
  }

  private renderSettings(): void {
    const { mode, side, think, level, showEval, showBest } = this.settings;
    const press = (container: HTMLElement, value: string) =>
      container
        .querySelectorAll<HTMLElement>('button[data-v]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value)));
    press(this.el.modeSeg, mode);
    press(this.el.sideSeg, side);
    press(this.el.thinkSeg, String(think));
    this.el.levelSelect.value = level;
    this.el.showEval.checked = showEval;
    this.el.showBest.checked = showBest;
    this.el.levelSetting.hidden = mode !== 'play';
    this.el.helpSetting.hidden = mode !== 'play';
    this.el.thinkSetting.hidden = mode !== 'analysis';
  }

  private renderMoveHint(): void {
    const hint = this.el.moveHint;
    if (this.moveMessage) {
      hint.textContent = this.moveMessage.text;
      hint.className = `hint${this.moveMessage.err ? ' err' : ''}`;
      return;
    }
    hint.className = 'hint';
    hint.textContent =
      this.settings.mode === 'analysis'
        ? 'Tap a piece and then its square, or just the square when only one piece can go there. Enter the moves of both sides.'
        : 'Tap a piece and then its square, or just the square when only one piece can go there.';
  }

  private renderChip(): void {
    const a = this.analysis.status;
    const thinking = a === 'thinking' || this.opponent.status === 'thinking';
    let cls = 'chip';
    let text: string;
    if (a === 'failed') {
      cls += ' failed';
      text = 'Engine failed to load';
    } else if (a === 'loading') {
      text = 'Loading engine…';
    } else {
      cls += thinking ? ' thinking' : ' ready';
      text = thinking ? 'Thinking…' : 'Engine ready';
    }
    this.el.chip.className = cls;
    this.el.engineName.textContent = text;
  }
}
