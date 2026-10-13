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

/** Cache key: the same position searched with the same limit gives the same answer. */
export function cacheKey(go: string, fen: string): string {
  return `${go}|${fen}`;
}

/**
 * Evaluates the positions of a game one after another, the first first, so the review fills in from the start
 * while the engine works. Positions found in the cache, or where the game is over, need no search.
 */
export class ReviewRunner {
  readonly evals: Array<PositionEval | undefined>;
  private current: number | null = null;
  private lastScore: Score | null = null;
  private stopped = false;

  constructor(
    private readonly engine: ReviewEngine,
    private readonly positions: readonly GamePosition[],
    private readonly go: string,
    private readonly cache: Map<string, PositionEval>,
    private readonly onUpdate: () => void,
  ) {
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
    if (this.current !== null) this.engine.cancel();
    this.current = null;
  }

  handleInfo(job: ReviewJob, info: EngineInfo): void {
    if (job.index !== this.current || info.multipv !== 1) return;
    this.lastScore = info.score;
  }

  handleBestMove(job: ReviewJob, move: string | null): void {
    if (job.index !== this.current) return;
    const position = this.positions[job.index];
    const evaluation: PositionEval = { score: this.lastScore ?? EQUAL, best: move };
    this.evals[job.index] = evaluation;
    if (position) this.cache.set(cacheKey(this.go, position.fen), evaluation);
    this.current = null;
    this.requestNext();
    this.onUpdate();
  }

  private requestNext(): void {
    if (this.stopped || this.current !== null) return;
    const index = this.evals.findIndex((e) => !e);
    const position = this.positions[index];
    if (index < 0 || !position) return;
    this.current = index;
    this.lastScore = null;
    this.engine.request({ fen: position.fen, go: this.go, index });
  }
}
