import type { Color } from 'chess.js';
import { reviewMove, type Judgement, type MoveReview, type PositionEval } from './classify';
import { gamePositions, type GamePosition } from './runner';

/** A move of the user's to try again: the position before it, what they played and what the engine preferred. */
export interface RetryItem {
  /** Index of the move in the game, 0 for the first move. */
  index: number;
  /** The position before the move, which is the one to find a better move in. */
  fen: string;
  color: Color;
  /** The move played in the game, in UCI notation. */
  played: string;
  /** The engine's choice, in UCI notation. */
  best: string;
  judgement: Judgement;
}

/** Only real errors are worth practising; an inaccuracy is often a matter of taste. */
const PRACTISED: ReadonlySet<Judgement> = new Set(['mistake', 'blunder']);

/** The user's mistakes and blunders in game order, never the opponent's. */
export function retryItems(
  reviews: ReadonlyArray<MoveReview | undefined>,
  positions: readonly GamePosition[],
  you: Color,
): RetryItem[] {
  return reviews.flatMap((r): RetryItem[] => {
    const before = positions[r?.index ?? -1];
    if (!r?.judgement || !r.best || r.color !== you || !PRACTISED.has(r.judgement) || !before) return [];
    return [
      { index: r.index, fen: before.fen, color: r.color, played: r.played, best: r.best, judgement: r.judgement },
    ];
  });
}

/** The position after playing `uci` in `fen`, marked final when the move ends the game. Null for an illegal move. */
export function positionAfter(fen: string, uci: string): GamePosition | null {
  try {
    return gamePositions(fen, [uci])[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Whether an answer is good: the engine's own choice, or a move the review would not mark at all, so one that keeps
 * the winning chances within the inaccuracy threshold of the best move (with the same mate rules as the review).
 * `before` is the engine's view of the position, `after` its view of the position after the answer.
 */
export function isGoodAnswer(item: RetryItem, answer: string, before: PositionEval, after: PositionEval): boolean {
  if (answer === item.best) return true;
  return reviewMove(item.index, item.color, answer, { ...before, best: item.best }, after).judgement === null;
}

/** How an item ended: found without help, found after the best move was shown, or skipped. */
export type RetryOutcome = 'found' | 'shown' | 'skipped';

/**
 * A practice run over a list of positions. For each one the user tries moves until one is good, may ask to see the
 * best move after a miss, and may skip it. Only answers found without seeing the best move count as found.
 */
export class RetryRun {
  private position = 0;
  private missCount = 0;
  private revealed = false;
  private solved = false;
  private readonly outcomes: RetryOutcome[] = [];

  constructor(readonly items: readonly RetryItem[]) {}

  /** The item being practised, or undefined once the run is over. */
  get item(): RetryItem | undefined {
    return this.items[this.position];
  }

  /** Zero-based number of the current item. */
  get current(): number {
    return this.position;
  }

  get total(): number {
    return this.items.length;
  }

  get finished(): boolean {
    return this.position >= this.items.length;
  }

  /** Wrong answers given for the current item. */
  get misses(): number {
    return this.missCount;
  }

  /** Whether the best move of the current item has been shown. */
  get bestShown(): boolean {
    return this.revealed;
  }

  /** Whether the current item has been answered well, so the run waits for the user to go on. */
  get answered(): boolean {
    return this.solved;
  }

  /** The best move may be shown once the user has missed at least once. */
  get canShowBest(): boolean {
    return this.missCount > 0 && !this.revealed && !this.solved;
  }

  get found(): number {
    return this.outcomes.filter((o) => o === 'found').length;
  }

  /** Records an answer to the current item. Answers after a good one, or after the run, are ignored. */
  answer(good: boolean): void {
    if (this.finished || this.solved) return;
    if (!good) {
      this.missCount++;
      return;
    }
    this.solved = true;
    this.outcomes[this.position] = this.revealed ? 'shown' : 'found';
  }

  showBest(): void {
    if (this.canShowBest) this.revealed = true;
  }

  /** Moves on to the next item; an item not answered well counts as skipped. */
  next(): void {
    if (this.finished) return;
    if (!this.solved) this.outcomes[this.position] = 'skipped';
    this.position++;
    this.missCount = 0;
    this.revealed = false;
    this.solved = false;
  }
}
