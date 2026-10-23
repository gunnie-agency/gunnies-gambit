import type { Color } from 'chess.js';
import { winningChances, type Score } from '../util/score';

/** What the engine found in one position of the game. */
export interface PositionEval {
  /** From the side to move's point of view, as UCI reports it. `mate 0`: the side to move is mated. */
  score: Score;
  /** The engine's best move in UCI notation, or null when the game is over in this position. */
  best: string | null;
}

export type Judgement = 'inaccuracy' | 'mistake' | 'blunder';

export interface MoveReview {
  /** Index of the move in the game, 0 for the first move. */
  index: number;
  color: Color;
  /** The move played, in UCI notation. */
  played: string;
  /** The engine's choice in the position before the move. */
  best: string | null;
  judgement: Judgement | null;
  /** Winning chances (-1..1) for the mover before and after the move. */
  before: number;
  after: number;
  /** 0 to 100: how much of the mover's chances the move kept. */
  accuracy: number;
}

export interface SideSummary {
  inaccuracy: number;
  mistake: number;
  blunder: number;
  /** Average accuracy of the side's reviewed moves, or null when it has none. */
  accuracy: number | null;
}

/** Lost winning chances (on the -1..1 scale) from which a move is marked. The same as Lichess. */
const THRESHOLDS: ReadonlyArray<[number, Judgement]> = [
  [0.3, 'blunder'],
  [0.2, 'mistake'],
  [0.1, 'inaccuracy'],
];

export const JUDGEMENT_SYMBOL: Record<Judgement, string> = { inaccuracy: '?!', mistake: '?', blunder: '??' };

/**
 * Judges one move from the engine's view of the position before it and the position after it.
 *
 * Mates get Lichess's separate rules, since the winning-chance curve treats every mate alike: letting a forced mate
 * slip, or walking into one, is judged by how good the position still is. Everything else is judged by the drop in
 * the mover's winning chances. The engine's own choice is never marked, so search noise cannot flag it.
 */
export function reviewMove(
  index: number,
  color: Color,
  played: string,
  before: PositionEval,
  after: PositionEval,
): MoveReview {
  const chancesBefore = winningChances(before.score);
  // The position after the move is scored for the opponent, so its chances are flipped to the mover's side.
  const chancesAfter = -winningChances(after.score);
  const isBest = played === before.best;
  const drop = isBest ? 0 : Math.max(0, chancesBefore - chancesAfter);
  return {
    index,
    color,
    played,
    best: before.best,
    judgement: isBest ? null : (mateJudgement(before.score, after.score) ?? cpJudgement(drop)),
    before: chancesBefore,
    after: chancesAfter,
    accuracy: moveAccuracy(drop),
  };
}

function cpJudgement(drop: number): Judgement | null {
  return THRESHOLDS.find(([limit]) => drop >= limit)?.[1] ?? null;
}

/** Mate judgements, or undefined to fall back to the winning-chance drop. Scores as in {@link PositionEval}. */
function mateJudgement(before: Score, after: Score): Judgement | undefined {
  // `after` is from the opponent's view. `mate 0` there means the opponent is mated: the mover is mating.
  const afterMating = after.kind === 'mate' && after.value <= 0;
  const afterMated = after.kind === 'mate' && after.value > 0;
  if (before.kind === 'mate' && before.value > 0 && !afterMating)
    return mateGrade(after.kind === 'cp' ? -after.value : 0);
  if (before.kind === 'cp' && afterMated) return mateGrade(-before.value);
  return undefined;
}

/**
 * Lichess's grading of a forced mate let slip (centipawns after the move) or walked into (centipawns before it),
 * from the mover's view: the better the position still is, the milder the judgement.
 */
function mateGrade(cp: number): Judgement {
  if (cp > 999) return 'inaccuracy';
  return cp > 700 ? 'mistake' : 'blunder';
}

/** Lichess's accuracy curve, on winning chances in percent. */
function moveAccuracy(drop: number): number {
  if (drop <= 0) return 100;
  const raw = 103.1668 * Math.exp(-0.04354 * drop * 50) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/** Reviews every move whose positions before and after have both been evaluated. */
export function reviewGame(
  startColor: Color,
  moves: readonly string[],
  evals: ReadonlyArray<PositionEval | undefined>,
) {
  const reviews: Array<MoveReview | undefined> = [];
  moves.forEach((played, i) => {
    const before = evals[i];
    const after = evals[i + 1];
    const color: Color = (i % 2 === 0) === (startColor === 'w') ? 'w' : 'b';
    reviews.push(before && after ? reviewMove(i, color, played, before, after) : undefined);
  });
  return reviews;
}

export function summarise(reviews: ReadonlyArray<MoveReview | undefined>): Record<Color, SideSummary> {
  const side = (color: Color): SideSummary => {
    const mine = reviews.filter((r): r is MoveReview => r?.color === color);
    const count = (j: Judgement) => mine.filter((r) => r.judgement === j).length;
    return {
      inaccuracy: count('inaccuracy'),
      mistake: count('mistake'),
      blunder: count('blunder'),
      accuracy: mine.length ? mine.reduce((sum, r) => sum + r.accuracy, 0) / mine.length : null,
    };
  };
  return { w: side('w'), b: side('b') };
}

/** White's winning chances (-1..1) in a position, for the eval graph. */
export function whiteChances(evaluation: PositionEval, sideToMove: Color): number {
  const chances = winningChances(evaluation.score);
  return sideToMove === 'w' ? chances : -chances;
}

/**
 * The position after the next mistake or blunder after position `from`, starting over from the beginning after the
 * last one, or null when there is none. Inaccuracies are skipped: the move list and the graph show them, and stopping
 * on each would bury the real errors.
 */
export function nextMistake(reviews: ReadonlyArray<MoveReview | undefined>, from: number): number | null {
  const marked = reviews.flatMap((r, i) => (r?.judgement === 'mistake' || r?.judgement === 'blunder' ? [i + 1] : []));
  return marked.find((p) => p > from) ?? marked[0] ?? null;
}
