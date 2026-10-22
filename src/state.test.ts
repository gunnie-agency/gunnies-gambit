import { DEFAULT_POSITION } from 'chess.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadReviewCache, loadSaved, replay, saveGame, saveReviewCache, settingsOf } from './state';

const KEY = 'gunnies-gambit.v2';

describe('saved game', () => {
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
    const settings = { ...DEFAULT_SETTINGS, mode: 'analysis' as const, side: 'b' as const, showEval: true };
    saveGame(DEFAULT_POSITION, ['e2e4', 'c7c5'], settings);
    const saved = loadSaved();
    expect(saved).toEqual({ ...settings, startFen: DEFAULT_POSITION, moves: ['e2e4', 'c7c5'] });
    expect(saved && settingsOf(saved)).toEqual(settings);
  });

  it('returns null when nothing is saved or the JSON is corrupt', () => {
    expect(loadSaved()).toBeNull();
    store[KEY] = '{"mode":"play",';
    expect(loadSaved()).toBeNull();
    store[KEY] = '42';
    expect(loadSaved()).toBeNull();
    store[KEY] = 'null';
    expect(loadSaved()).toBeNull();
  });

  it('fills missing or invalid fields with defaults', () => {
    store[KEY] = JSON.stringify({ side: 'b', think: 1234, level: 'grandmaster', showBest: 'yes', moves: 'e2e4' });
    expect(loadSaved()).toEqual({
      ...DEFAULT_SETTINGS,
      side: 'b',
      orient: 'b',
      startFen: DEFAULT_POSITION,
      moves: [],
    });
    store[KEY] = '{}';
    expect(loadSaved()).toEqual({ ...DEFAULT_SETTINGS, startFen: DEFAULT_POSITION, moves: [] });
  });

  it('keeps the moves only up to the first one that is not a string', () => {
    store[KEY] = JSON.stringify({ moves: ['e2e4', 5, 'g1f3'] });
    expect(loadSaved()?.moves).toEqual(['e2e4']);
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(loadSaved()).toBeNull();
    expect(() => saveGame(DEFAULT_POSITION, [], DEFAULT_SETTINGS)).not.toThrow();
  });

  it('survives storage that is missing entirely', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadSaved()).toBeNull();
    expect(() => saveGame(DEFAULT_POSITION, [], DEFAULT_SETTINGS)).not.toThrow();
  });
});

describe('replay', () => {
  const ENDGAME = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';

  it('replays UCI moves from a start position', () => {
    const { game, startFen } = replay(ENDGAME, ['e2e4', 'e8d7', 'e4e5']);
    expect(startFen).toBe(ENDGAME);
    expect(game.history()).toEqual(['e4', 'Kd7', 'e5']);
  });

  it('stops at the first move that is illegal or not UCI', () => {
    expect(replay(DEFAULT_POSITION, ['e2e4', 'e2e4', 'e7e5']).game.history()).toEqual(['e4']);
    expect(replay(DEFAULT_POSITION, ['e2e4', 'Nf6', 'e7e5']).game.history()).toEqual(['e4']);
  });

  it('falls back to the start position for a bad start FEN', () => {
    for (const bad of ['', 'not a fen', '8/8/8/8/8/8/8/8 w - - 0 1']) {
      const { game, startFen } = replay(bad, ['e2e4']);
      expect(startFen).toBe(DEFAULT_POSITION);
      expect(game.history()).toEqual(['e4']);
    }
  });

  it('rejects a start FEN where the side not to move is in check', () => {
    const { game, startFen } = replay('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1', ['e2e4']);
    expect(startFen).toBe(DEFAULT_POSITION);
    expect(game.fen()).not.toContain('4R3');
  });
});

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
