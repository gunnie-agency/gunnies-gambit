import { describe, expect, it } from 'vitest';
import { reviewGame, type PositionEval } from './classify';
import { isGoodAnswer, positionAfter, retryItems, RetryRun, type RetryItem } from './retry';
import { gamePositions } from './runner';

const cp = (value: number, best: string | null = 'e2e4'): PositionEval => ({ score: { kind: 'cp', value }, best });
const mate = (value: number, best: string | null = null): PositionEval => ({ score: { kind: 'mate', value }, best });

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('retryItems', () => {
  // 1. e4 e5 2. Qh5 Nc6 3. Qxf7+?? (White blunders) Kxf7, with 2… Nc6 a mistake by Black.
  const moves = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'h5f7', 'e8f7'];
  const positions = gamePositions(START, moves);
  const evals = [cp(30), cp(-30), cp(30), cp(-20, 'g7g6'), cp(160, 'f1c4'), cp(800, 'e8f7'), cp(-800)];
  const reviews = reviewGame('w', moves, evals);

  it('lists only the user’s mistakes and blunders, with the position before each', () => {
    expect(reviews[3]?.judgement).toBe('mistake');
    expect(reviews[4]?.judgement).toBe('blunder');
    expect(retryItems(reviews, positions, 'w')).toEqual([
      { index: 4, fen: positions[4]?.fen, color: 'w', played: 'h5f7', best: 'f1c4', judgement: 'blunder' },
    ]);
    expect(retryItems(reviews, positions, 'b').map((i) => i.index)).toEqual([3]);
  });

  it('leaves out inaccuracies and moves not reviewed yet', () => {
    const partial = reviewGame('w', moves, [cp(0), cp(0, 'g8f6'), cp(60), undefined]);
    expect(partial[1]?.judgement).toBe('inaccuracy');
    expect(partial[2]).toBeUndefined();
    expect(retryItems(partial, positions, 'b')).toEqual([]);
  });
});

describe('positionAfter', () => {
  it('plays the move and marks a mate as final', () => {
    const fen = 'rnbqkbnr/ppppp2p/5p2/6p1/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3';
    expect(positionAfter(fen, 'd1h5')?.final).toEqual(mate(0));
    expect(positionAfter(START, 'e2e4')).toMatchObject({ turn: 'b' });
    expect(positionAfter(START, 'e2e4')?.final).toBeUndefined();
  });

  it('returns null for an illegal move', () => {
    expect(positionAfter(START, 'e2e5')).toBeNull();
  });
});

describe('isGoodAnswer', () => {
  const item: RetryItem = { index: 4, fen: START, color: 'w', played: 'h5f7', best: 'f1c4', judgement: 'blunder' };
  const before = cp(160, 'f1c4');

  it('accepts the engine’s choice whatever the search after it says', () => {
    expect(isGoodAnswer(item, 'f1c4', before, cp(300))).toBe(true);
  });

  it('accepts a move that keeps the chances within the inaccuracy threshold', () => {
    expect(isGoodAnswer(item, 'g1f3', before, cp(-130))).toBe(true);
  });

  it('turns down a move that loses as much as an inaccuracy or more', () => {
    expect(isGoodAnswer(item, 'a2a3', before, cp(-20))).toBe(false);
    expect(isGoodAnswer(item, 'h5f7', before, cp(800))).toBe(false);
  });

  it('accepts a mate, and judges a missed mate by the mate rules', () => {
    expect(isGoodAnswer(item, 'd1h5', mate(1, 'f1c4'), mate(0))).toBe(true);
    expect(isGoodAnswer(item, 'a2a3', mate(2, 'f1c4'), cp(-400))).toBe(false);
  });
});

describe('RetryRun', () => {
  const items = [1, 3, 5].map((index): RetryItem => ({
    index,
    fen: START,
    color: 'w',
    played: 'a2a3',
    best: 'e2e4',
    judgement: 'mistake',
  }));

  it('counts a position found when it is answered well without help', () => {
    const run = new RetryRun(items);
    expect(run.item?.index).toBe(1);
    run.answer(true);
    expect(run.answered).toBe(true);
    run.answer(false); // ignored once answered
    expect(run.misses).toBe(0);
    run.next();
    expect(run.current).toBe(1);
    expect(run.answered).toBe(false);
    expect(run.found).toBe(1);
  });

  it('offers the best move after a miss, and does not count it found after that', () => {
    const run = new RetryRun(items);
    expect(run.canShowBest).toBe(false);
    run.showBest();
    expect(run.bestShown).toBe(false);
    run.answer(false);
    expect(run.misses).toBe(1);
    expect(run.canShowBest).toBe(true);
    run.showBest();
    expect(run.bestShown).toBe(true);
    expect(run.canShowBest).toBe(false);
    run.answer(true);
    run.next();
    expect(run.found).toBe(0);
    expect(run.bestShown).toBe(false);
    expect(run.misses).toBe(0);
  });

  it('skips positions and finishes after the last one', () => {
    const run = new RetryRun(items);
    run.next();
    run.answer(true);
    run.next();
    run.next();
    expect(run.finished).toBe(true);
    expect(run.item).toBeUndefined();
    expect(run.found).toBe(1);
    expect(run.total).toBe(3);
    run.next();
    run.answer(true);
    expect(run.found).toBe(1);
  });
});
