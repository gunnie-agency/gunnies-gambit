import { describe, expect, it } from 'vitest';
import { nextMistake, reviewGame, reviewMove, summarise, whiteChances, type PositionEval } from './classify';

const cp = (value: number, best: string | null = 'e2e4'): PositionEval => ({ score: { kind: 'cp', value }, best });
const mate = (value: number, best: string | null = 'e2e4'): PositionEval => ({ score: { kind: 'mate', value }, best });

describe('reviewMove', () => {
  it('leaves a move alone when the mover keeps their chances', () => {
    // +0.30 for the mover before; +0.25 for the mover after, which the engine reports as -0.25 for the opponent.
    const r = reviewMove(0, 'w', 'd2d4', cp(30), cp(-25));
    expect(r.judgement).toBeNull();
    expect(r.accuracy).toBeGreaterThan(95);
  });

  it('marks inaccuracies, mistakes and blunders by the drop in winning chances', () => {
    expect(reviewMove(0, 'w', 'a2a3', cp(0), cp(60)).judgement).toBe('inaccuracy');
    expect(reviewMove(0, 'w', 'a2a3', cp(0), cp(120)).judgement).toBe('mistake');
    expect(reviewMove(0, 'w', 'a2a3', cp(0), cp(300)).judgement).toBe('blunder');
  });

  it('is lenient once the game is decided either way', () => {
    // Up a rook or down a rook, a pawn more or less hardly changes the winning chances.
    expect(reviewMove(0, 'w', 'a2a3', cp(900), cp(-800)).judgement).toBeNull();
    expect(reviewMove(0, 'w', 'a2a3', cp(-900), cp(1000)).judgement).toBeNull();
  });

  it('never marks the engine’s own choice', () => {
    const r = reviewMove(0, 'w', 'e2e4', cp(50, 'e2e4'), cp(200));
    expect(r.judgement).toBeNull();
    expect(r.accuracy).toBe(100);
  });

  it('marks letting a forced mate slip by how good the position still is', () => {
    expect(reviewMove(0, 'w', 'a2a3', mate(2), cp(-1200)).judgement).toBe('inaccuracy');
    expect(reviewMove(0, 'w', 'a2a3', mate(2), cp(-800)).judgement).toBe('mistake');
    expect(reviewMove(0, 'w', 'a2a3', mate(2), cp(-200)).judgement).toBe('blunder');
    expect(reviewMove(0, 'w', 'a2a3', mate(2), mate(3)).judgement).toBe('blunder');
  });

  it('accepts a slower mate and delivering mate', () => {
    expect(reviewMove(0, 'w', 'a2a3', mate(2), mate(-4)).judgement).toBeNull();
    expect(reviewMove(0, 'w', 'a2a3', mate(1), mate(0, null)).judgement).toBeNull();
  });

  it('marks walking into a forced mate by how bad the position already was', () => {
    expect(reviewMove(0, 'b', 'a7a6', cp(50), mate(3)).judgement).toBe('blunder');
    expect(reviewMove(0, 'b', 'a7a6', cp(-800), mate(3)).judgement).toBe('mistake');
    expect(reviewMove(0, 'b', 'a7a6', cp(-1500), mate(3)).judgement).toBe('inaccuracy');
  });
});

describe('reviewGame and summarise', () => {
  it('reviews only moves with both positions evaluated, alternating colours', () => {
    const reviews = reviewGame('w', ['e2e4', 'e7e5', 'g1f3'], [cp(30, 'e2e4'), cp(-30, 'c7c5'), cp(300)]);
    expect(reviews.map((r) => r?.color)).toEqual(['w', 'b', undefined]);
    expect(reviews[1]?.judgement).toBe('blunder');
  });

  it('starts with Black when the position does', () => {
    const reviews = reviewGame('b', ['e7e5'], [cp(0), cp(0)]);
    expect(reviews[0]?.color).toBe('b');
  });

  it('counts judgements and averages accuracy per side', () => {
    const reviews = reviewGame('w', ['a2a3', 'e7e5', 'h2h3'], [cp(0), cp(300, 'e7e5'), cp(0, 'h2h3'), cp(0)]);
    const s = summarise(reviews);
    expect(s.w.blunder).toBe(1);
    // One blunder (about 31%) and one perfect move.
    expect(s.w.accuracy).toBeCloseTo(65.7, 1);
    expect(s.b).toEqual({ inaccuracy: 0, mistake: 0, blunder: 0, accuracy: 100 });
    expect(summarise([]).w.accuracy).toBeNull();
  });
});

describe('nextMistake', () => {
  it('stops on mistakes and blunders, not inaccuracies, and starts over after the last', () => {
    const reviews = reviewGame(
      'w',
      ['a2a3', 'e7e5', 'h2h3', 'd7d6', 'b2b3', 'g7g6'],
      [cp(0), cp(60, 'e7e5'), cp(0), cp(120, 'd7d6'), cp(0), cp(300, 'g7g6'), undefined],
    );
    expect(reviews.map((r) => r?.judgement)).toEqual(['inaccuracy', null, 'mistake', null, 'blunder', undefined]);
    expect(nextMistake(reviews, 0)).toBe(3);
    expect(nextMistake(reviews, 3)).toBe(5);
    expect(nextMistake(reviews, 5)).toBe(3);
    expect(nextMistake(reviews.slice(0, 2), 0)).toBeNull();
  });
});

describe('whiteChances', () => {
  it('flips Black-to-move scores and treats being mated as lost', () => {
    expect(whiteChances(cp(100), 'b')).toBeLessThan(0);
    expect(whiteChances(mate(0, null), 'b')).toBe(1);
    expect(whiteChances(mate(0, null), 'w')).toBe(-1);
  });
});
