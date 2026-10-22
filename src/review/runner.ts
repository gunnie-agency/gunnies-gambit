import { Chess, type Color } from 'chess.js';
import type { EngineInfo } from '../engine/info';
import type { SearchJob } from '../engine/queue';
import { gameEnd } from '../util/moves';
import type { Score } from '../util/score';
import { parseUciMove } from '../util/uci';
import type { PositionEval } from './classify';

export interface ReviewJob extends SearchJob {
  /** Index of the position in the game: 0 is the start position, n the position after the nth move. */
  index: number;
}

/** The part of {@link Engine} the runner needs, so tests can drive it without a worker. */
export interface ReviewEngine {
  request(job: ReviewJob): void;
  cancel(): void;
}

export interface GamePosition {
  fen: string;
  turn: Color;
  /** Set when the game is over in this position, so it needs no search. */
  final?: PositionEval;
}

const EQUAL: Score = { kind: 'cp', value: 0 };

/** Every position of a game, from the start position up to and including the final one. */
export function gamePositions(startFen: string, moves: readonly string[]): GamePosition[] {
  const game = new Chess(startFen);
  const at = (): GamePosition => {
    const end = gameEnd(game);
    const position: GamePosition = { fen: game.fen(), turn: game.turn() };
    if (end === 'checkmate') position.final = { score: { kind: 'mate', value: 0 }, best: null };
    else if (end) position.final = { score: EQUAL, best: null };
    return position;
  };
  const positions = [at()];
  for (const uci of moves) {
    const move = parseUciMove(uci);
    if (!move) break;
    game.move(move);
    positions.push(at());
  }
  return positions;
}

/**
 * Cache key: the same position searched with the same limit gives the same answer. The `clear` prefix marks results
 * searched with {@link REVIEW_OPTIONS}; results stored before that, keyed without it, are never used again.
 */
export function cacheKey(go: string, fen: string): string {
  return `clear|${go}|${fen}`;
}

/**
 * How many engines a review runs side by side. Each Stockfish lite worker is a single thread with its own WASM
 * memory (about 115 MB measured in Node), and a review scales almost linearly with workers until the cores run out.
 * Two workers leave room for the page on a quad-core; a third one only where the browser reports plenty of memory,
 * which phones with eight small cores usually do not. `deviceMemory` is Chromium-only, so others get at most two.
 */
export function reviewWorkerCount(cores: number, memoryGb?: number): number {
  if (cores >= 8 && memoryGb !== undefined && memoryGb >= 8) return 3;
  return cores >= 4 ? 2 : 1;
}

/**
 * UCI options for every review search. Clearing the hash first makes a result depend on the position alone, not on
 * which worker searched it or what that worker searched before, so a review comes out the same with any number of
 * workers and in any order.
 */
export const REVIEW_OPTIONS = { 'Clear Hash': true } as const;

interface Search {
  job: ReviewJob;
  engine: ReviewEngine;
  lastScore: Score | null;
}

/**
 * Evaluates the positions of a game on a pool of engines, each searching one position at a time, always the first
 * positions still open, so the review fills in from the start while the engines work. Results may arrive in any
 * order. Positions found in the cache, or where the game is over, need no search.
 */
export class ReviewRunner {
  readonly evals: Array<PositionEval | undefined>;
  private readonly engines: ReviewEngine[];
  /** The running searches by position index. */
  private readonly searches = new Map<number, Search>();
  private stopped = false;

  constructor(
    engines: readonly ReviewEngine[],
    private readonly positions: readonly GamePosition[],
    private readonly go: string,
    private readonly cache: Map<string, PositionEval>,
    private readonly onUpdate: () => void,
  ) {
    this.engines = [...engines];
    this.evals = positions.map((p) => p.final ?? cache.get(cacheKey(go, p.fen)));
  }

  get total(): number {
    return this.positions.length;
  }

  get done(): number {
    return this.evals.filter(Boolean).length;
  }

  get finished(): boolean {
    return this.done === this.total;
  }

  start(): void {
    this.stopped = false;
    this.requestNext();
  }

  cancel(): void {
    this.stopped = true;
    for (const search of this.searches.values()) search.engine.cancel();
    this.searches.clear();
  }

  /** Stops using an engine that failed; its position goes to another engine. */
  removeEngine(engine: ReviewEngine): void {
    const i = this.engines.indexOf(engine);
    if (i < 0) return;
    this.engines.splice(i, 1);
    for (const [index, search] of this.searches) if (search.engine === engine) this.searches.delete(index);
    this.requestNext();
  }

  handleInfo(job: ReviewJob, info: EngineInfo): void {
    const search = this.searchFor(job);
    if (search && info.multipv === 1) search.lastScore = info.score;
  }

  handleBestMove(job: ReviewJob, move: string | null): void {
    const search = this.searchFor(job);
    if (!search) return;
    const position = this.positions[job.index];
    const evaluation: PositionEval = { score: search.lastScore ?? EQUAL, best: move };
    this.evals[job.index] = evaluation;
    if (position) this.cache.set(cacheKey(this.go, position.fen), evaluation);
    this.searches.delete(job.index);
    this.requestNext();
    this.onUpdate();
  }

  /** The running search `job` belongs to, or undefined for output of a search that was cancelled or replaced. */
  private searchFor(job: ReviewJob): Search | undefined {
    const search = this.searches.get(job.index);
    return search?.job === job ? search : undefined;
  }

  private requestNext(): void {
    if (this.stopped) return;
    const busy = new Set([...this.searches.values()].map((s) => s.engine));
    let from = 0;
    for (const engine of this.engines) {
      if (busy.has(engine)) continue;
      const index = this.evals.findIndex((e, i) => i >= from && !e && !this.searches.has(i));
      const position = this.positions[index];
      if (index < 0 || !position) return;
      from = index + 1;
      const job: ReviewJob = { fen: position.fen, go: this.go, options: REVIEW_OPTIONS, index };
      this.searches.set(index, { job, engine, lastScore: null });
      engine.request(job);
    }
  }
}
