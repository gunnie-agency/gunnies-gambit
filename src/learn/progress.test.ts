import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lessonById } from './lessons';
import { hasGoal, loadSolved, parseSolved, progressText, saveSolved } from './progress';

const KEY = 'gunnies-gambit.lessons.v1';

describe('progress', () => {
  it('counts puzzles as lessons with a goal, and rule boards not', () => {
    expect(hasGoal(lessonById('knight-fork'))).toBe(true);
    expect(hasGoal(lessonById('checkmate'))).toBe(false);
    expect(hasGoal(lessonById('pawn-ending'))).toBe(false);
    expect(hasGoal(undefined)).toBe(false);
  });

  it('keeps only known puzzle ids from a stored value', () => {
    expect(parseSolved({ solved: ['pin', 'gone', 7, 'checkmate', 'skewer', 'pin'] })).toEqual(
      new Set(['pin', 'skewer']),
    );
    expect(parseSolved(null)).toEqual(new Set());
    expect(parseSolved({ solved: 'pin' })).toEqual(new Set());
    expect(parseSolved(['pin'])).toEqual(new Set());
  });

  it("says how many of a section's lessons are solved", () => {
    const solved = new Set(['pin', 'skewer', 'ladder']);
    expect(progressText(['pin', 'skewer', 'knight-fork'], solved)).toBe('2 of 3 solved');
    expect(progressText([], solved)).toBe('0 of 0 solved');
  });
});

describe('stored progress', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => (store[key] = value),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads back what it saved, under its own key', () => {
    expect(loadSolved()).toEqual(new Set());
    saveSolved(new Set(['pin', 'arabian']));
    expect(JSON.parse(store[KEY] ?? '')).toEqual({ solved: ['pin', 'arabian'] });
    expect(loadSolved()).toEqual(new Set(['pin', 'arabian']));
  });

  it('treats corrupt JSON or missing storage as nothing solved, and saving without storage as a no-op', () => {
    store[KEY] = '{oops';
    expect(loadSolved()).toEqual(new Set());
    vi.stubGlobal('localStorage', undefined);
    expect(loadSolved()).toEqual(new Set());
    expect(() => saveSolved(new Set(['pin']))).not.toThrow();
  });
});
