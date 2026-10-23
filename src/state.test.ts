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
    expect(saved).toEqual({ ...settings, startFen: DEFAULT_POSITION, moves: ['e2e4', 'c7c5'], tags: {} });
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
      tags: {},
    });
    store[KEY] = '{}';
    expect(loadSaved()).toEqual({ ...DEFAULT_SETTINGS, startFen: DEFAULT_POSITION, moves: [], tags: {} });
  });

  it('keeps the tags of a loaded game, only the known ones with text values', () => {
    const tags = { White: 'Alice', Black: 'Bob', Result: '0-1', WhiteElo: '1500' };
    saveGame(DEFAULT_POSITION, ['e2e4'], DEFAULT_SETTINGS, tags);
    expect(loadSaved()?.tags).toEqual(tags);
    store[KEY] = JSON.stringify({ tags: { White: 'Alice', Black: 7, Annotator: 'me', Result: 'won' } });
    expect(loadSaved()?.tags).toEqual({ White: 'Alice' });
    store[KEY] = JSON.stringify({ tags: ['White'] });
    expect(loadSaved()?.tags).toEqual({});
  });

  it('reads the sound setting, off for older saves without it and for anything but true', () => {
    saveGame(DEFAULT_POSITION, [], { ...DEFAULT_SETTINGS, sound: true });
    expect(loadSaved()?.sound).toBe(true);
    store[KEY] = JSON.stringify({ mode: 'analysis', side: 'b', showEval: true, moves: ['e2e4'] });
    expect(loadSaved()).toMatchObject({ mode: 'analysis', showEval: true, sound: false, moves: ['e2e4'] });
    store[KEY] = JSON.stringify({ sound: 'on' });
    expect(loadSaved()?.sound).toBe(false);
  });

  it('keeps a practice game’s side and level beside the user’s own settings', () => {
    const practice = { side: 'b', level: 'max', goal: 'mate' } as const;
    saveGame(DEFAULT_POSITION, ['e2e4'], DEFAULT_SETTINGS, {}, { practice });
    const saved = loadSaved();
    expect(saved?.practice).toEqual({ side: 'b', level: 'max', goal: 'mate' });
    expect(saved && settingsOf(saved)).toEqual(DEFAULT_SETTINGS);
    store[KEY] = JSON.stringify({ practice: { side: 'b', level: 'grandmaster' } });
    expect(loadSaved()).not.toHaveProperty('practice');
    store[KEY] = JSON.stringify({ practice: { side: 'w', level: 'max', goal: 'win' } });
    expect(loadSaved()?.practice).toEqual({ side: 'w', level: 'max' });
    store[KEY] = JSON.stringify({ practice: 'max' });
    expect(loadSaved()).not.toHaveProperty('practice');
  });

  it('remembers which side resigned', () => {
    saveGame(DEFAULT_POSITION, ['e2e4'], DEFAULT_SETTINGS, {}, { resigned: 'w' });
    expect(loadSaved()?.resigned).toBe('w');
    saveGame(DEFAULT_POSITION, ['e2e4'], DEFAULT_SETTINGS, {}, { resigned: null });
    expect(loadSaved()).not.toHaveProperty('resigned');
    store[KEY] = JSON.stringify({ resigned: true });
    expect(loadSaved()).not.toHaveProperty('resigned');
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
