import { describe, expect, it } from 'vitest';
import { clampView, moveName, shownMoves, STEP_KEYS, stepView, viewAt } from './cursor';

describe('viewAt', () => {
  it('is the live position at or past the last move', () => {
    expect(viewAt(5, 5)).toBeNull();
    expect(viewAt(9, 5)).toBeNull();
  });

  it('is an earlier position before it, never below the start', () => {
    expect(viewAt(3, 5)).toBe(3);
    expect(viewAt(0, 5)).toBe(0);
    expect(viewAt(-2, 5)).toBe(0);
  });

  it('treats a game without moves as always live', () => {
    expect(viewAt(0, 0)).toBeNull();
  });

  it('ignores a value that is not a number of moves', () => {
    expect(viewAt(Number.NaN, 5)).toBeNull();
    expect(viewAt(2.7, 5)).toBe(2);
  });
});

describe('shownMoves', () => {
  it('counts the moves up to the shown position', () => {
    expect(shownMoves(null, 7)).toBe(7);
    expect(shownMoves(2, 7)).toBe(2);
  });
});

describe('stepView', () => {
  it('steps back from the live position', () => {
    expect(stepView(null, 4, 'prev')).toBe(3);
    expect(stepView(null, 4, 'first')).toBe(0);
  });

  it('stops at the start position', () => {
    expect(stepView(0, 4, 'prev')).toBe(0);
  });

  it('returns to the live position after the last move', () => {
    expect(stepView(3, 4, 'next')).toBeNull();
    expect(stepView(1, 4, 'last')).toBeNull();
    expect(stepView(null, 4, 'next')).toBeNull();
  });

  it('steps forward through earlier positions', () => {
    expect(stepView(1, 4, 'next')).toBe(2);
  });

  it('stays live in a game without moves', () => {
    expect(stepView(null, 0, 'prev')).toBeNull();
    expect(stepView(null, 0, 'first')).toBeNull();
  });
});

describe('clampView', () => {
  it('keeps a view that still fits', () => {
    expect(clampView(2, 6)).toBe(2);
    expect(clampView(null, 6)).toBeNull();
  });

  it('goes live when the game got shorter than the view', () => {
    expect(clampView(4, 4)).toBeNull();
    expect(clampView(5, 3)).toBeNull();
  });
});

describe('moveName', () => {
  it('numbers White and Black moves from the position before them', () => {
    expect(moveName('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e4')).toBe('1. e4');
    expect(moveName('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 12', 'Nf6')).toBe('12… Nf6');
  });
});

describe('STEP_KEYS', () => {
  it('maps the arrow keys, Home and End', () => {
    expect(STEP_KEYS).toEqual({ ArrowLeft: 'prev', ArrowRight: 'next', Home: 'first', End: 'last' });
  });
});
