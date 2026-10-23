import { Chess, DEFAULT_POSITION, type Color, type Move, type Square } from 'chess.js';
import { askPromotion, closePromotion, enableArrowKeys, renderArrows, renderBoard, type Arrow } from '../board/board';
import { Engine, STOCKFISH_URL, type EngineStatus } from '../engine/engine';
import type { EngineInfo } from '../engine/info';
import { LEVELS, levelById } from '../engine/levels';
import type { SearchJob } from '../engine/queue';
import { showOpening } from '../openings/view';
import { Review } from '../review/view';
import { DEFAULT_SETTINGS, loadSaved, replay, saveGame, settingsOf, type Mode, type Settings } from '../state';
import { clampView, moveName, shownMoves, STEP_KEYS, stepView, type Step, type View } from '../util/cursor';
import { escapeHtml } from '../util/html';
import { parsePracticeLink } from '../util/link';
import { fenProblem, gameEnd, parseTypedMove, uniqueMoveTo, type GameEnd } from '../util/moves';
import { buildPgn, pgnFileName } from '../util/pgn';
import { moveSound } from '../util/sounds';
import { numberMoves, pvToSan } from '../util/san';
import { evalBarPercent, formatScore, toWhitePov, verdict, type Score } from '../util/score';
import { parseUciMove, toUci, type UciMove } from '../util/uci';
import { Sounds } from './sound';

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
    showEval: $<HTMLInputElement>('showEval'),
    showBest: $<HTMLInputElement>('showBest'),
    soundOn: $<HTMLInputElement>('soundOn'),
    moves: $('moves'),
    liveBtn: $<HTMLButtonElement>('liveBtn'),
    undoBtn: $<HTMLButtonElement>('undoBtn'),
    flipBtn: $<HTMLButtonElement>('flipBtn'),
    newBtn: $<HTMLButtonElement>('newBtn'),
    fenInput: $<HTMLInputElement>('fenInput'),
    pgnInput: $<HTMLTextAreaElement>('pgnInput'),
    loadFen: $<HTMLButtonElement>('loadFen'),
    copyFen: $<HTMLButtonElement>('copyFen'),
    loadPgn: $<HTMLButtonElement>('loadPgn'),
    copyPgn: $<HTMLButtonElement>('copyPgn'),
    downloadPgn: $<HTMLButtonElement>('downloadPgn'),
    sharePgn: $<HTMLButtonElement>('sharePgn'),
    toolsHint: $('toolsHint'),
  };

  /** The move hint from the HTML, shown when there is no message: in the page so its lines are there on load. */
  private readonly moveHintHtml = this.el.moveHint.innerHTML;

  private game: Chess;
  /** The moves of `game`, refreshed in positionChanged: every chess.js history() call replays the whole game. */
  private played: Move[];
  private startFen: string;
  private settings: Settings;
  private selected: Square | null = null;
  /** The square of the pawn whose promotion piece is being asked, so focus can return there on Escape. */
  private promotionFrom: Square | null = null;
  private moveMessage: { text: string; err: boolean } | null = null;
  /** The position shown outside review: the live one, or an earlier one picked in the move list. */
  private view: View = null;
  /** The game up to that earlier position, or null while the live position is shown. */
  private viewGame: Chess | null = null;
  /** The moves that a new line from an earlier position replaced in Analyse, so Undo can bring them back. */
  private dropped: { at: number; moves: Move[] } | null = null;
  /** What the move list shows, so a render that changes only the current move keeps the focused button. */
  private movesKey = '';

  /** Analysis of the current position (best move, eval, lines). */
  private lines: Line[] = [];
  private analysisDone = false;
  private analysisFen: string | null = null;
  /** Position for which the user asked a hint in play mode. */
  private hintFen: string | null = null;

  private opponentFen: string | null = null;
  private replyTimer: ReturnType<typeof setTimeout> | undefined;
  private renderQueued = false;
  /** What the arrows layer shows, so a render that changes nothing leaves the SVG alone. */
  private arrowsKey = '';

  private readonly analysis: Engine;
  private readonly opponent: Engine<MoveJob>;
  /** Engines are started on first use, so a worker that is never needed never loads. */
  private readonly started = { analysis: false, opponent: false };
  private readonly review: Review;
  private readonly sounds = new Sounds();

  constructor() {
    const saved = loadSaved();
    const restored = replay(saved?.startFen ?? DEFAULT_POSITION, saved?.moves ?? []);
    this.game = restored.game;
    this.played = this.game.history({ verbose: true });
    this.startFen = restored.startFen;
    this.settings = saved ? settingsOf(saved) : { ...DEFAULT_SETTINGS };
    this.sounds.enabled = this.settings.sound;

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
        opening: $('reviewOpening'),
        move: $('reviewMove'),
        detail: $('reviewDetail'),
        nav: $('reviewNav'),
        graph: document.getElementById('reviewGraph') as unknown as SVGElement,
        progress: $<HTMLProgressElement>('reviewProgress'),
        progressText: $('reviewProgressText'),
        summary: $('reviewSummary'),
        live: $('reviewLive'),
        moves: $('moves'),
        practiceStart: $<HTMLButtonElement>('reviewPracticeStart'),
        practice: $('reviewPractice'),
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
    this.view = null;
    this.settings = { ...this.settings, mode: 'analysis', side: options.side, orient: options.side };
    this.positionChanged();
    if (options.review) this.startReview();
    return true;
  }

  // ---------- derived state ----------

  /** The game whose position the board shows and the analysis follows: the live game or an earlier position. */
  private get shown(): Chess {
    return this.viewGame ?? this.game;
  }

  private get fen(): string {
    return this.shown.fen();
  }

  /** Whether the live game has ended. */
  private get isOver(): boolean {
    return gameEnd(this.game) !== null;
  }

  /** Whether the shown position is final: an earlier position never is, unless the game was loaded that way. */
  private get shownOver(): boolean {
    return gameEnd(this.shown) !== null;
  }

  /** Whether the user may enter a move for the side to move. In play mode only on the live position. */
  private get canInput(): boolean {
    if (this.settings.mode === 'analysis') return true;
    return this.view === null && this.game.turn() === this.settings.side;
  }

  /** In play mode an earlier position is only for looking at. */
  private get viewOnly(): boolean {
    return this.view !== null && this.settings.mode === 'play';
  }

  private get isEngineTurn(): boolean {
    if (this.review.active) return false;
    return this.settings.mode === 'play' && this.game.turn() !== this.settings.side && !this.isOver;
  }

  /** Review needs moves, and in play mode a finished game. */
  private get canReview(): boolean {
    return this.played.length > 0 && (this.settings.mode === 'analysis' || this.isOver);
  }

  /** Whether any analysis output is shown (and so computed) for the current position. */
  private get showAnalysis(): boolean {
    if (this.review.active || this.viewOnly || this.shownOver) return false;
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

    // The opponent always answers the live position, also while the user looks at an earlier one.
    const live = this.game.fen();
    if (this.isEngineTurn) {
      if (this.opponentFen !== live) {
        this.opponentFen = live;
        clearTimeout(this.replyTimer);
        const level = levelById(this.settings.level);
        this.startEngine('opponent');
        this.opponent.request({ fen: live, go: level.go, options: level.options, requestedAt: Date.now() });
      }
    } else {
      // Also when opponentFen was already cleared (undo, a loaded game): a search may still run for the old position.
      // Cancelling an engine that never started does nothing, so this keeps the lazy start.
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
    if (job.fen !== this.game.fen() || !this.isEngineTurn) return;
    const parsed = move ? parseUciMove(move) : null;
    if (!parsed) return;
    const wait = Math.max(0, MIN_REPLY_MS - (Date.now() - job.requestedAt));
    clearTimeout(this.replyTimer);
    this.replyTimer = setTimeout(() => {
      if (this.game.fen() === job.fen && this.isEngineTurn) this.playMove(parsed);
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
    this.cancelPromotion();
    this.restartAnalysis();
    this.hintFen = null;
    this.played = this.game.history({ verbose: true });
    // An earlier position stays shown while the opponent replies; anything else that changes the game resets it.
    this.view = clampView(this.view, this.played.length);
    this.viewGame = this.view === null ? null : this.gameAfter(this.view);
    this.dropped = null;
    this.save();
    this.syncEngines();
    this.render();
  }

  /** The game up to its first `moves` moves. */
  private gameAfter(moves: number): Chess {
    return replay(this.startFen, this.played.slice(0, moves).map(toUci)).game;
  }

  /** Shows an earlier position, or the live one for null. Read-only in play mode; in Analyse the engine follows. */
  private showView(view: View): void {
    const next = clampView(view, this.played.length);
    if (next === this.view) return;
    this.view = next;
    this.viewGame = next === null ? null : this.gameAfter(next);
    this.cancelPromotion();
    this.hintFen = null;
    this.moveMessage = null;
    this.restartAnalysis();
    this.syncEngines();
    this.render();
  }

  private step(step: Step): void {
    this.showView(stepView(this.view, this.played.length, step));
  }

  /** Plays a move on the live game: the user's, or the opponent's reply. */
  private playMove(move: UciMove): boolean {
    try {
      this.playSound(this.game.move(move));
    } catch {
      return false;
    }
    this.moveMessage = null;
    this.positionChanged();
    return true;
  }

  private playSound(move: Move): void {
    this.sounds.play(moveSound(move, this.isOver));
  }

  /**
   * Plays the user's move on the shown position. From an earlier position in Analyse it starts a new line there: the
   * later moves are dropped, and Undo brings them back. Asking first would interrupt every exploration, and an undo
   * loses nothing.
   */
  private userMove(move: UciMove): boolean {
    if (this.view === null) return this.playMove(move);
    if (this.viewOnly) {
      this.blockViewOnly();
      return false;
    }
    const at = this.view;
    const next = this.played[at];
    if (next?.from === move.from && next.to === move.to && next.promotion === move.promotion) {
      // The move the game went on with: step forward instead of throwing the rest of the line away.
      this.showView(at + 1);
      return true;
    }
    try {
      new Chess(this.fen).move(move);
    } catch {
      return false;
    }
    const dropped = this.played.slice(at);
    for (let i = 0; i < dropped.length; i++) this.game.undo();
    this.playSound(this.game.move(move));
    this.view = null;
    const later = dropped.length === 1 ? 'The move that followed is' : `The ${dropped.length} moves that followed are`;
    this.moveMessage = { text: `New line from here. ${later} gone; Undo brings them back.`, err: false };
    this.positionChanged();
    this.dropped = { at, moves: dropped };
    return true;
  }

  private blockViewOnly(): void {
    this.moveMessage = { text: 'This is an earlier position. Go back to the game to play your move.', err: true };
    this.renderMoveHint();
  }

  private tryUserMove(game: Chess, from: Square, to: Square, promotion: boolean): void {
    // While practising mistakes the review takes the move.
    const play = (move: UciMove) => {
      if (this.review.active) {
        this.selected = null;
        this.review.answer(move);
      } else this.userMove(move);
    };
    if (!promotion) {
      play({ from, to });
      return;
    }
    this.promotionFrom = from;
    // The picker closes on anything that changes what the board takes, but a pick must never land somewhere else.
    const fen = game.fen();
    const reviewing = this.review.active;
    askPromotion(this.el.promo, game.turn(), (piece) => {
      this.promotionFrom = null;
      const unchanged = this.review.active === reviewing && this.moveTarget?.fen() === fen;
      if (piece && unchanged) play({ from, to, promotion: piece });
      else {
        this.selected = null;
        this.renderBoardOnly();
      }
      this.focusSquare(piece ? to : from);
    });
  }

  /** Closes the promotion picker without a move and forgets the selected square. */
  private cancelPromotion(): void {
    closePromotion(this.el.promo);
    this.promotionFrom = null;
    this.selected = null;
  }

  private focusSquare(sq: Square): void {
    this.el.board.querySelector<HTMLElement>(`[data-sq="${sq}"]`)?.focus();
  }

  /**
   * The position the board takes a move in, or null when it takes none now. In review that is only while the user
   * practises their mistakes.
   */
  private get moveTarget(): Chess | null {
    if (this.review.active) return this.review.acceptsMoves ? this.review.board : null;
    if (this.viewOnly || this.shownOver || !this.canInput) return null;
    return this.shown;
  }

  /** The position a tap on the board plays in; on an earlier position in play mode it says why there is none. */
  private inputGame(): Chess | null {
    if (!this.review.active && this.viewOnly) this.blockViewOnly();
    return this.moveTarget;
  }

  private onSquare(sq: Square): void {
    const game = this.inputGame();
    if (!game) return;

    if (this.selected) {
      if (sq === this.selected) {
        this.selected = null;
        this.renderBoardOnly();
        return;
      }
      const candidates = game.moves({ square: this.selected, verbose: true }).filter((m) => m.to === sq);
      if (candidates.length) {
        this.tryUserMove(
          game,
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
      this.tryUserMove(game, unique.from, unique.to, unique.promotion);
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
    const dropped = this.dropped;
    if (dropped && this.played.length === dropped.at + 1) {
      // Undo right after a new line: back to the earlier position, with the old line restored.
      this.game.undo();
      dropped.moves.forEach((m) => this.game.move({ from: m.from, to: m.to, promotion: m.promotion }));
      this.view = dropped.at;
      this.moveMessage = { text: 'The old line is back.', err: false };
      this.positionChanged();
      return;
    }
    this.view = null;
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
    this.view = null;
    this.opponentFen = null;
    this.positionChanged();
  }

  private startReview(): void {
    if (!this.canReview) return;
    const { side, mode } = this.settings;
    this.review.open({
      startFen: this.startFen,
      moves: this.played.map(toUci),
      you: side,
      them: mode === 'play' ? 'The computer' : 'Your opponent',
    });
    this.cancelPromotion();
    if (this.view !== null) {
      // The review closes on the live position: forget the lines of the earlier one.
      this.view = null;
      this.viewGame = null;
      this.restartAnalysis();
    }
    this.syncEngines();
    this.render();
    document.getElementById('review')?.focus();
  }

  private exitReview(): void {
    this.review.close();
    this.cancelPromotion();
    this.syncEngines();
    this.render();
    this.el.reviewBtn.focus();
  }

  private save(): void {
    saveGame(this.startFen, this.played.map(toUci), this.settings);
  }

  private updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.cancelPromotion();
    this.save();
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
    this.view = null;
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
      if (move && this.showAnalysis && this.canInput) this.userMove(move);
    });
    el.hintBtn.addEventListener('click', () => {
      this.hintFen = this.fen;
      this.syncEngines();
      this.render();
    });

    el.reviewStart.addEventListener('click', () => this.startReview());
    el.reviewBtn.addEventListener('click', () => this.startReview());
    el.reviewExit.addEventListener('click', () => this.exitReview());

    // Outside review the move list steps through the game; while it is open the review handles it.
    el.moves.addEventListener('click', (e) => {
      const ply = (e.target as HTMLElement).closest<HTMLElement>('button[data-ply]')?.dataset.ply;
      if (!this.review.active && ply !== undefined) this.showView(Number(ply));
    });
    el.moves.addEventListener('keydown', (e) => {
      const step = STEP_KEYS[e.key];
      if (this.review.active || !step || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      this.step(step);
      el.moves.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
    });
    el.liveBtn.addEventListener('click', () => {
      this.showView(null);
      el.moves.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
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
      if (this.viewOnly) {
        this.blockViewOnly();
        return;
      }
      if (this.shownOver) {
        this.moveMessage = { text: 'The game is over. Undo a move or start a new game.', err: true };
      } else if (!this.canInput) {
        this.moveMessage = { text: 'Wait for the computer to move.', err: true };
      } else {
        const move = parseTypedMove(this.fen, raw);
        if (move) {
          const san = new Chess(this.fen).move(move).san;
          const newLine = this.view !== null;
          el.moveInput.value = '';
          this.userMove(move);
          if (!newLine) this.moveMessage = { text: `Added ${san}.`, err: false };
        } else {
          this.moveMessage = {
            text: `“${raw}” is not a legal move here. ${COLOR_NAME[this.shown.turn()]} is to move.`,
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
      this.hintFen = null;
      // Undo after a new line only brings the old one back in the mode and side it was replaced in.
      this.dropped = null;
      this.restartAnalysis();
      this.updateSettings({ mode });
      this.warmOpponent();
    });
    seg(el.sideSeg, (v) => {
      const side = v as Color;
      if (side === this.settings.side) return;
      this.dropped = null;
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
    el.soundOn.addEventListener('change', () => {
      this.sounds.enabled = el.soundOn.checked;
      this.updateSettings({ sound: el.soundOn.checked });
      this.sounds.unlock();
      this.sounds.play('move'); // a sample, so the user hears what they switched on
    });
    // Audio may only start from a user gesture: every press is one, the first move included.
    const unlock = () => this.sounds.unlock();
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);

    el.loadFen.addEventListener('click', () => {
      const fen = el.fenInput.value.trim();
      const problem = fenProblem(fen);
      if (problem) return this.toolsHint(`That FEN is not valid: ${problem}`, true);
      this.game.load(fen);
      this.startFen = fen;
      this.opponentFen = null;
      this.view = null;
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
      this.view = null;
      this.positionChanged();
      this.toolsHint(`Imported ${this.played.length} moves.`);
    });
    el.copyFen.addEventListener('click', () => this.copy(this.fen, 'FEN copied.', el.fenInput));
    el.copyPgn.addEventListener('click', () => this.copy(this.pgn(), 'PGN copied.', el.pgnInput));
    el.downloadPgn.addEventListener('click', () => this.downloadPgn());
    // Phones and some desktops can hand the game to another app, such as a chess app or a chat.
    el.sharePgn.hidden = typeof navigator.share !== 'function';
    el.sharePgn.addEventListener('click', () => this.sharePgn());

    window.addEventListener('hashchange', () => {
      if (!this.readPracticeLink()) return;
      this.positionChanged();
      this.warmOpponent();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      // A destination-only tap opens the picker without a selected square, so focus goes back to the pawn.
      const pawn = el.promo.hidden ? null : this.promotionFrom;
      this.cancelPromotion();
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

  /** The whole game as PGN, with who played which side in play mode. */
  private pgn(): string {
    const { mode, side, level } = this.settings;
    return buildPgn({
      startFen: this.startFen,
      moves: this.played.map(toUci),
      players: mode === 'play' ? { mode, side, level: levelById(level).label } : { mode },
      site: import.meta.env.VITE_SITE_URL,
      date: new Date(),
    });
  }

  private downloadPgn(): void {
    const url = URL.createObjectURL(new Blob([this.pgn()], { type: 'application/x-chess-pgn' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = pgnFileName(new Date());
    link.click();
    // Revoking at once can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    this.toolsHint(`Saved as ${link.download}.`);
  }

  /** Shares the game as a .pgn file where the device accepts one, else as text. */
  private sharePgn(): void {
    const pgn = this.pgn();
    const name = pgnFileName(new Date());
    const file = new File([pgn], name, { type: 'application/x-chess-pgn' });
    const data: ShareData = navigator.canShare?.({ files: [file] })
      ? { files: [file], title: name }
      : { title: name, text: pgn };
    navigator.share(data).then(
      () => this.toolsHint('PGN shared.'),
      (e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return; // the user closed the share sheet
        this.toolsHint('Sharing did not work. Copy or download the PGN instead.', true);
      },
    );
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
    this.el.undoBtn.disabled = this.played.length === 0;
    const reviewing = this.review.active;
    this.el.advice.hidden = reviewing;
    this.el.moveForm.hidden = reviewing;
    this.el.settingsBox.hidden = reviewing;
    this.el.reviewBtn.disabled = reviewing || !this.canReview;
    this.el.liveBtn.hidden = reviewing || this.view === null;
  }

  /** The side at the bottom of the board: the user's while practising mistakes, else the setting. */
  private get orient(): Color {
    return this.review.orient ?? this.settings.orient;
  }

  private renderBoardOnly(): void {
    const { orient } = this;
    if (this.review.active) {
      renderBoard(this.el.board, { game: this.review.board, orient, selected: this.selected });
    } else {
      const last = this.played[shownMoves(this.view, this.played.length) - 1];
      renderBoard(this.el.board, { game: this.shown, orient, selected: this.selected, last });
    }
    this.renderArrowsOnly();
  }

  private renderArrowsOnly(): void {
    const arrows = this.review.active ? this.review.arrows : this.analysisArrows();
    const key = [this.orient, ...arrows.map((a) => (a.primary ? a.uci : `(${a.uci})`))].join(' ');
    if (key === this.arrowsKey) return;
    this.arrowsKey = key;
    renderArrows(this.el.arrows, this.orient, arrows);
  }

  private analysisArrows(): Arrow[] {
    const arrows: Arrow[] = [];
    const [l1, l2] = this.lines;
    if (this.showAnalysis && this.bestVisible && l1?.pv[0]) {
      arrows.push({ uci: l1.pv[0], primary: true });
      if (this.linesVisible && l2?.pv[0] && l2.pv[0] !== l1.pv[0]) arrows.push({ uci: l2.pv[0], primary: false });
    }
    return arrows;
  }

  private renderStatus(): void {
    const html = this.statusHtml();
    if (this.el.status.innerHTML !== html) this.el.status.innerHTML = html;
  }

  private statusHtml(): string {
    if (this.review.active) return this.review.status;
    if (this.view !== null) return this.viewHtml(this.view);
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

  /** The status while an earlier position is shown. Short enough for the two lines the status reserves on a phone. */
  private viewHtml(view: number): string {
    const move = this.played[view - 1];
    const where = move ? `After ${escapeHtml(moveName(move.before, move.san))}` : 'Start position';
    const next =
      this.settings.mode === 'play'
        ? 'Looking back. Go back to the game to play your move.'
        : 'Looking back. A move here starts a new line.';
    return `${where}<small>${next}</small>`;
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
    const yours = this.shown.turn() === this.settings.side;
    const showEval = this.evalVisible;
    el.hintBtn.hidden = true;
    el.reviewStart.hidden = true;
    el.playBest.hidden = false;
    el.playBest.disabled = true;
    el.playBest.textContent = mode === 'analysis' && !yours ? 'They played this' : 'Play it';
    el.evalbar.classList.toggle('off', !showEval);
    el.lines.classList.toggle('no-score', !showEval);

    if (this.viewOnly) {
      this.waitAdvice('Earlier position', 'Looking back', 'The engine helps again on the live position.');
      el.playBest.hidden = true;
      this.setBar(null);
      return;
    }
    if (this.shownOver) {
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
    const white = toWhitePov(l1.score, this.shown.turn());
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
          ? `<span class="score">${formatScore(toWhitePov(ln.score, this.shown.turn()))}</span>`
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
    this.el.evalbar.classList.toggle('flipped', this.orient === 'b');
    this.el.evalbar.title = title;
  }

  /**
   * The move list: one button per move, showing the position after it. Rebuilt only when the moves change, so the
   * button that has focus while stepping through the game stays in place.
   */
  private renderMoves(): void {
    if (this.review.active) {
      this.movesKey = ''; // the review draws its own move list
      return;
    }
    const el = this.el.moves;
    const sans = this.played.map((m) => m.san);
    // The opening follows the shown position, as in the review.
    showOpening($('opening'), this.startFen, sans.slice(0, shownMoves(this.view, sans.length)));
    const key = `${this.startFen}|${sans.join(' ')}`;
    if (key !== this.movesKey) {
      this.movesKey = key;
      const focused = el.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.ply : '';
      el.innerHTML = sans.length ? this.movesHtml(sans) : '<span class="empty">No moves yet.</span>';
      if (focused) el.querySelector<HTMLElement>(`[data-ply="${focused}"]`)?.focus();
    }
    const current = String(shownMoves(this.view, this.played.length));
    let cur: HTMLElement | null = null;
    for (const b of el.querySelectorAll<HTMLElement>('button[data-ply]')) {
      const isCurrent = b.dataset.ply === current;
      b.classList.toggle('cur', isCurrent);
      if (isCurrent) {
        b.setAttribute('aria-current', 'true');
        cur = b;
      } else b.removeAttribute('aria-current');
    }
    this.scrollMoves(this.view === null ? null : cur);
  }

  private movesHtml(sans: string[]): string {
    let html = '';
    const numbered = numberMoves(this.startFen, sans);
    if (this.startFen.split(' ')[1] === 'b')
      html += `<span class="n">${numbered[0]?.label.replace('…', '.')}</span><span class="m">…</span>`;
    numbered.forEach((m, i) => {
      const move = this.played[i];
      const label = move ? escapeHtml(moveName(move.before, m.san)) : '';
      if (m.label.endsWith('.')) html += `<span class="n">${m.label}</span>`;
      html += `<button type="button" class="m" data-ply="${i + 1}" aria-label="${label}">${escapeHtml(m.san)}</button>`;
    });
    return html;
  }

  /** Keeps the current move in view without scrolling the page: the last move when live, else the shown one. */
  private scrollMoves(cur: HTMLElement | null): void {
    const el = this.el.moves;
    if (!cur) {
      el.scrollTop = this.view === null ? el.scrollHeight : 0;
      return;
    }
    const top = cur.offsetTop - el.offsetTop;
    if (top < el.scrollTop) el.scrollTop = top - 8;
    else if (top + cur.offsetHeight > el.scrollTop + el.clientHeight)
      el.scrollTop = top + cur.offsetHeight - el.clientHeight + 8;
  }

  private renderSettings(): void {
    const { mode, side, think, level, showEval, showBest, sound } = this.settings;
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
    this.el.soundOn.checked = sound;
    // The settings and the hint text that differ per mode follow this attribute (style.css). The theme script sets
    // it from the saved game before the first paint, so a returning user sees nothing appear or vanish on load.
    if (mode === 'analysis') document.documentElement.dataset.mode = mode;
    else delete document.documentElement.dataset.mode;
  }

  private renderMoveHint(): void {
    const hint = this.el.moveHint;
    if (this.moveMessage) {
      hint.textContent = this.moveMessage.text;
      hint.className = `hint${this.moveMessage.err ? ' err' : ''}`;
      return;
    }
    hint.className = 'hint';
    if (hint.innerHTML !== this.moveHintHtml) hint.innerHTML = this.moveHintHtml;
  }

  private renderChip(): void {
    const statuses: EngineStatus[] = [];
    if (this.started.analysis) statuses.push(this.analysis.status);
    if (this.started.opponent) statuses.push(this.opponent.status);
    const thinking = statuses.includes('thinking');
    let cls = 'chip';
    let text: string;
    if (!statuses.length) {
      text = 'Engine idle'; // nothing has needed an engine yet, as on a finished game in Analyse
    } else if (statuses.includes('failed')) {
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
