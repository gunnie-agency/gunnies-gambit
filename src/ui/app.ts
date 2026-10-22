import { Chess, DEFAULT_POSITION, type Color, type Square } from 'chess.js';
import { askPromotion, closePromotion, enableArrowKeys, renderArrows, renderBoard, type Arrow } from '../board/board';
import { Engine, STOCKFISH_URL, type EngineStatus } from '../engine/engine';
import type { EngineInfo } from '../engine/info';
import { LEVELS, levelById } from '../engine/levels';
import type { SearchJob } from '../engine/queue';
import { Review } from '../review/view';
import { DEFAULT_SETTINGS, loadSaved, replay, saveGame, settingsOf, type Mode, type Settings } from '../state';
import { escapeHtml } from '../util/html';
import { parsePracticeLink } from '../util/link';
import { fenProblem, gameEnd, parseTypedMove, uniqueMoveTo, type GameEnd } from '../util/moves';
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
const DRAW_TEXT: Record<Exclude<GameEnd, 'checkmate'>, string> = {
  stalemate: 'Stalemate. The game is drawn.',
  threefold: 'Draw by threefold repetition.',
  insufficient: 'Draw by insufficient material.',
  'fifty-moves': 'Draw by the 50-move rule.',
};

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
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
    advice: $('advice'),
    settingsBox: $('settings'),
    reviewStart: $<HTMLButtonElement>('reviewStart'),
    reviewBtn: $<HTMLButtonElement>('reviewBtn'),
    reviewExit: $<HTMLButtonElement>('reviewExit'),
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
  /** The square of the pawn whose promotion piece is being asked, so focus can return there on Escape. */
  private promotionFrom: Square | null = null;
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
  /** Engines are started on first use, so a worker that is never needed never loads. */
  private readonly started = { analysis: false, opponent: false };
  private readonly review: Review;

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

    this.review = new Review(
      {
        panel: $('review'),
        title: $('reviewTitle'),
        move: $('reviewMove'),
        detail: $('reviewDetail'),
        nav: $('reviewNav'),
        graph: document.getElementById('reviewGraph') as unknown as SVGElement,
        progress: $<HTMLProgressElement>('reviewProgress'),
        progressText: $('reviewProgressText'),
        summary: $('reviewSummary'),
        live: $('reviewLive'),
        moves: $('moves'),
      },
      () => this.render(),
    );

    this.el.levelSelect.innerHTML = LEVELS.map((l) => `<option value="${l.id}">${escapeHtml(l.label)}</option>`).join(
      '',
    );
    this.bindEvents();
    enableArrowKeys(this.el.board);
  }

  start(): void {
    this.readPracticeLink();
    this.positionChanged();
    this.warmOpponent();
  }

  /** Opens a finished game in Analyse with the user's side set, optionally starting its review. False if unreadable. */
  loadGame(pgn: string, options: { side: Color; review: boolean }): boolean {
    const parsed = new Chess();
    try {
      parsed.loadPgn(pgn, { strict: false });
    } catch {
      return false;
    }
    const restored = replay(parsed.getHeaders().FEN ?? DEFAULT_POSITION, parsed.history({ verbose: true }).map(toUci));
    this.game = restored.game;
    this.startFen = restored.startFen;
    this.opponentFen = null;
    this.hintFen = null;
    this.moveMessage = null;
    this.restartAnalysis();
    this.settings = { ...this.settings, mode: 'analysis', side: options.side, orient: options.side };
    this.positionChanged();
    if (options.review) this.startReview();
    return true;
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
    if (this.review.active) return false;
    return this.settings.mode === 'play' && this.game.turn() !== this.settings.side && !this.isOver;
  }

  /** Review needs moves, and in play mode a finished game. */
  private get canReview(): boolean {
    return this.game.history().length > 0 && (this.settings.mode === 'analysis' || this.isOver);
  }

  /** Whether any analysis output is shown (and so computed) for the current position. */
  private get showAnalysis(): boolean {
    if (this.isOver || this.review.active) return false;
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

  private startEngine(name: keyof App['started']): void {
    this.started[name] = true;
    this[name].start();
  }

  /**
   * In play mode, loads the opponent before its first move is due. Waits while the analysis engine is still loading,
   * so the page never compiles two engines at once without needing both.
   */
  private warmOpponent(): void {
    if (this.settings.mode !== 'play' || this.started.opponent) return;
    if (this.started.analysis && this.analysis.status === 'loading') return;
    this.startEngine('opponent');
  }

  private syncEngines(): void {
    const fen = this.fen;
    if (this.showAnalysis) {
      if (this.analysisFen !== fen) {
        this.analysisFen = fen;
        const ms = this.settings.mode === 'analysis' ? this.settings.think : PLAY_THINK_MS;
        this.startEngine('analysis');
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
        this.startEngine('opponent');
        this.opponent.request({ fen, go: level.go, options: level.options, requestedAt: Date.now() });
      }
    } else if (this.opponentFen !== null) {
      this.opponentFen = null;
      clearTimeout(this.replyTimer);
      this.opponent.cancel();
    }
  }

  /**
   * Forgets the analysis so the next sync starts a fresh search, also when the position is the same as before
   * (a new game from the start position, a think-time change).
   */
  private restartAnalysis(): void {
    this.lines = [];
    this.analysisDone = false;
    if (this.analysisFen === null) return;
    this.analysisFen = null;
    this.analysis.cancel();
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
    this.warmOpponent();
    this.renderChip();
    this.scheduleRender();
  }

  // ---------- game actions ----------

  private positionChanged(): void {
    this.review.close();
    clearTimeout(this.replyTimer);
    this.selected = null;
    this.restartAnalysis();
    this.hintFen = null;
    this.promotionFrom = null;
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
    this.promotionFrom = from;
    askPromotion(this.el.promo, this.game.turn(), (piece) => {
      this.promotionFrom = null;
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
    if (this.isOver || !this.canInput || this.review.active) return;

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
    if (piece?.color === game.turn()) {
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

  private startReview(): void {
    if (!this.canReview) return;
    const { side, mode } = this.settings;
    this.review.open({
      startFen: this.startFen,
      moves: this.game.history({ verbose: true }).map(toUci),
      you: side,
      them: mode === 'play' ? 'The computer' : 'Your opponent',
    });
    this.selected = null;
    this.syncEngines();
    this.render();
    document.getElementById('review')?.focus();
  }

  private exitReview(): void {
    this.review.close();
    this.syncEngines();
    this.render();
    this.el.reviewBtn.focus();
  }

  private updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    saveGame(this.game, this.startFen, this.settings);
    this.syncEngines();
    this.render();
  }

  /**
   * Opens a practice link (`#fen=…&mode=play&side=…&level=…`, see util/link.ts) in place of the current game, says so
   * in the move hint, and removes the hash so a reload does not load it again. Anything else in the hash is ignored.
   * Returns whether a position was loaded; the caller then runs positionChanged.
   */
  private readPracticeLink(): boolean {
    const link = parsePracticeLink(location.hash);
    if (!link) return false;
    history.replaceState(null, '', location.pathname + location.search);
    this.game.load(link.fen);
    this.startFen = link.fen;
    this.settings = { ...this.settings, mode: 'play', side: link.side, orient: link.side, level: link.level };
    this.opponentFen = null;
    this.moveMessage = { text: 'Loaded the practice position.', err: false };
    return true;
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

    el.reviewStart.addEventListener('click', () => this.startReview());
    el.reviewBtn.addEventListener('click', () => this.startReview());
    el.reviewExit.addEventListener('click', () => this.exitReview());

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
      this.review.close();
      this.selected = null;
      this.hintFen = null;
      this.restartAnalysis();
      this.updateSettings({ mode });
      this.warmOpponent();
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

    window.addEventListener('hashchange', () => {
      if (!this.readPracticeLink()) return;
      this.positionChanged();
      this.warmOpponent();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      // A destination-only tap opens the picker without a selected square, so focus goes back to the pawn.
      const pawn = el.promo.hidden ? null : this.promotionFrom;
      closePromotion(el.promo);
      this.promotionFrom = null;
      this.selected = null;
      this.renderBoardOnly();
      if (pawn) this.focusSquare(pawn);
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
    const reviewing = this.review.active;
    this.el.advice.hidden = reviewing;
    this.el.moveForm.hidden = reviewing;
    this.el.settingsBox.hidden = reviewing;
    this.el.reviewBtn.disabled = reviewing || !this.canReview;
  }

  private renderBoardOnly(): void {
    const game = this.review.active ? this.review.board : this.game;
    renderBoard(this.el.board, { game, orient: this.settings.orient, selected: this.selected });
    this.renderArrowsOnly();
  }

  private renderArrowsOnly(): void {
    if (this.review.active) {
      renderArrows(this.el.arrows, this.settings.orient, this.review.arrows);
      return;
    }
    const arrows: Arrow[] = [];
    const [l1, l2] = this.lines;
    if (this.showAnalysis && this.bestVisible && l1?.pv[0]) {
      arrows.push({ uci: l1.pv[0], primary: true });
      if (this.linesVisible && l2?.pv[0] && l2.pv[0] !== l1.pv[0]) arrows.push({ uci: l2.pv[0], primary: false });
    }
    renderArrows(this.el.arrows, this.settings.orient, arrows);
  }

  private renderStatus(): void {
    const html = this.statusHtml();
    if (this.el.status.innerHTML !== html) this.el.status.innerHTML = html;
  }

  private statusHtml(): string {
    if (this.review.active)
      return 'Game review<small>Step through the moves with the buttons or the arrow keys, or jump to the next mistake.</small>';
    const end = gameEnd(this.game);
    if (end) return this.endHtml(end);
    const { side, mode } = this.settings;
    const yourMove = this.game.inCheck() ? 'Your move, and you are in check' : 'Your move';
    if (mode === 'analysis') {
      return this.game.turn() === side
        ? `${yourMove}<small>You play ${COLOR_NAME[side]}. Play the suggestion, or enter the move you choose.</small>`
        : 'Your opponent is to move<small>Enter their move on the board or type it below.</small>';
    }
    const level = escapeHtml(levelById(this.settings.level).label);
    if (this.opponent.status === 'failed')
      return 'The engine could not start.<small>Reload the page to try again.</small>';
    if (this.game.turn() === side)
      return `${yourMove}<small>You play ${COLOR_NAME[side]} against the computer (${level}).</small>`;
    return `The computer is thinking…<small>Level: ${level}</small>`;
  }

  private endHtml(end: GameEnd): string {
    if (end !== 'checkmate') return DRAW_TEXT[end];
    const winner: Color = this.game.turn() === 'w' ? 'b' : 'w';
    let result = 'You win.';
    if (winner !== this.settings.side)
      result = this.settings.mode === 'play' ? 'The computer wins.' : 'Your opponent wins.';
    return `Checkmate. ${result}<small>Undo a move to look again, or start a new game.</small>`;
  }

  private renderAnalysis(): void {
    const el = this.el;
    if (this.review.active) {
      el.evalbar.classList.remove('off');
      const bar = this.review.bar;
      this.paintBar(bar?.percent ?? 50, bar?.label ?? 'Evaluation');
      return;
    }

    const { mode } = this.settings;
    const yours = this.game.turn() === this.settings.side;
    const showEval = this.evalVisible;
    el.hintBtn.hidden = true;
    el.reviewStart.hidden = true;
    el.playBest.hidden = false;
    el.playBest.disabled = true;
    el.playBest.textContent = mode === 'analysis' && !yours ? 'They played this' : 'Play it';
    el.evalbar.classList.toggle('off', !showEval);
    el.lines.classList.toggle('no-score', !showEval);

    if (this.isOver) {
      this.waitAdvice('Result', 'Game over');
      el.playBest.hidden = true;
      el.reviewStart.hidden = !this.canReview;
      this.setBar(null);
      return;
    }
    if (mode === 'play' && !yours) {
      this.waitAdvice('Opponent', 'Thinking…');
      el.playBest.hidden = true;
      return;
    }
    if (!this.bestVisible) {
      this.waitAdvice('Hint', 'Need help?', 'A hint shows the best move in this position.');
      el.playBest.hidden = true;
      el.hintBtn.hidden = false;
      el.hintBtn.disabled = this.analysis.status === 'failed';
      if (showEval) this.renderEvalMeta();
      else this.setBar(null);
      return;
    }

    const l1 = this.lines[0];
    if (!l1) {
      this.waitAdvice(this.bestLabelText(yours), this.engineWaitText());
      return;
    }
    el.bestLabel.textContent = this.bestLabelText(yours);
    el.bestSan.textContent = pvToSan(this.fen, l1.pv, 1)[0] ?? l1.pv[0] ?? '';
    el.bestSan.className = 'best-san';
    el.playBest.disabled = false;
    if (showEval) this.renderEvalMeta();
    else el.bestMeta.textContent = `Engine suggestion, ${this.depthText()}`;
    el.lines.innerHTML = this.linesVisible ? this.linesHtml(showEval) : '';
  }

  /** Fills the advice panel with a label and a waiting text, and no lines. */
  private waitAdvice(label: string, text: string, meta = '\u00a0'): void {
    const el = this.el;
    el.bestLabel.textContent = label;
    el.bestSan.textContent = text;
    el.bestSan.className = 'best-san wait';
    el.bestMeta.textContent = meta;
    el.lines.innerHTML = '';
  }

  private bestLabelText(yours: boolean): string {
    if (this.settings.mode === 'play') return this.settings.showBest ? 'Best move' : 'Hint';
    return yours ? 'Best move for you' : 'Opponent’s strongest reply';
  }

  private engineWaitText(): string {
    if (this.analysis.status === 'failed') return 'Engine unavailable';
    return this.analysis.status === 'loading' ? 'Engine loading…' : 'Thinking…';
  }

  private depthText(): string {
    const l1 = this.lines[0];
    if (!l1) return '';
    return this.analysisDone ? `depth ${l1.depth} (done)` : `depth ${l1.depth}`;
  }

  /** The evaluation line under the best move, and the eval bar to match. */
  private renderEvalMeta(): void {
    const l1 = this.lines[0];
    if (!l1) {
      this.el.bestMeta.textContent = this.analysis.status === 'failed' ? 'Engine unavailable' : 'Evaluating…';
      return;
    }
    const white = toWhitePov(l1.score, this.game.turn());
    const v = verdict(white, this.settings.side);
    const score = `<b>${formatScore(white)}</b>`;
    this.el.bestMeta.innerHTML = `${score} · <span class="${v.tone}">${v.text}</span> · ${this.depthText()}`;
    this.setBar(white);
  }

  private linesHtml(showEval: boolean): string {
    const fen = this.fen;
    return this.lines
      .filter((ln): ln is Line => Boolean(ln))
      .map((ln) => {
        const moves = numberMoves(fen, pvToSan(fen, ln.pv, 9))
          .map((m, i) => {
            const san = i === 0 ? `<b>${m.san}</b>` : m.san;
            return m.label ? `${m.label} ${san}` : san;
          })
          .join(' ');
        const score = showEval
          ? `<span class="score">${formatScore(toWhitePov(ln.score, this.game.turn()))}</span>`
          : '';
        return `<li>${score}<span class="pv">${moves}</span></li>`;
      })
      .join('');
  }

  private setBar(white: Score | null): void {
    this.paintBar(evalBarPercent(white), white ? `Evaluation ${formatScore(white)} (White’s view)` : 'Evaluation');
  }

  private paintBar(percent: number, title: string): void {
    this.el.evalfill.style.height = `${percent.toFixed(1)}%`;
    this.el.evalbar.classList.toggle('flipped', this.settings.orient === 'b');
    this.el.evalbar.title = title;
  }

  private renderMoves(): void {
    if (this.review.active) return; // the review draws its own, clickable move list
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
    const statuses: EngineStatus[] = [];
    if (this.started.analysis) statuses.push(this.analysis.status);
    if (this.started.opponent) statuses.push(this.opponent.status);
    const thinking = statuses.includes('thinking');
    let cls = 'chip';
    let text: string;
    if (statuses.includes('failed')) {
      cls += ' failed';
      text = 'Engine failed to load';
    } else if (statuses.includes('loading')) {
      text = 'Loading engine…';
    } else {
      cls += thinking ? ' thinking' : ' ready';
      text = thinking ? 'Thinking…' : 'Engine ready';
    }
    this.el.chip.className = cls;
    this.el.engineName.textContent = text;
  }
}
