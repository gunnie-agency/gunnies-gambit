import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadReviewCache, saveReviewCache } from './state';

describe('review cache storage', () => {
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

  it('reads back what it saved', () => {
    saveReviewCache([
      ['nodes 1|fen a', { score: { kind: 'cp', value: 30 }, best: 'e2e4' }],
      ['nodes 1|fen b', { score: { kind: 'mate', value: 0 }, best: null }],
    ]);
    const cache = loadReviewCache();
    expect(cache.size).toBe(2);
    expect(cache.get('nodes 1|fen b')).toEqual({ score: { kind: 'mate', value: 0 }, best: null });
  });

  it('skips malformed entries and survives garbage', () => {
    store['gunnies-gambit.review.v1'] = JSON.stringify([
      ['ok', { score: { kind: 'cp', value: 1 }, best: 'e2e4' }],
      ['bad kind', { score: { kind: 'x', value: 1 }, best: null }],
      ['bad value', { score: { kind: 'cp', value: 'a' }, best: null }],
      [1, { score: { kind: 'cp', value: 1 }, best: null }],
      'nonsense',
    ]);
    expect([...loadReviewCache().keys()]).toEqual(['ok']);
    store['gunnies-gambit.review.v1'] = '{not json';
    expect(loadReviewCache().size).toBe(0);
  });
});
