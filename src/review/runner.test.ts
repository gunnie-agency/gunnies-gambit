import { DEFAULT_POSITION } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { PositionEval } from './classify';
import { cacheKey, gamePositions, ReviewRunner, type ReviewJob } from './runner';

const GO = 'nodes 1000';
const info = (value: number, multipv = 1) => ({
  depth: 10,
  multipv,
  score: { kind: 'cp' as const, value },
  pv: ['e2e4'],
});
// Fool's mate: the last position is checkmate and needs no search.
const FOOLS_MATE = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];

function setup(moves: string[], cache = new Map<string, PositionEval>()) {
  const requests: ReviewJob[] = [];
  let cancels = 0;
  let updates = 0;
  const engine = { request: (job: ReviewJob) => requests.push(job), cancel: () => cancels++ };
  const runner = new ReviewRunner(engine, gamePositions(DEFAULT_POSITION, moves), GO, cache, () => updates++);
  return { runner, requests, cache, cancels: () => cancels, updates: () => updates };
}

/** Plays the engine's part for the latest request. */
function answer(t: ReturnType<typeof setup>, score: number, best = 'e2e4') {
  const job = t.requests[t.requests.length - 1] as ReviewJob;
  t.runner.handleInfo(job, info(score));
  t.runner.handleBestMove(job, best);
}

describe('gamePositions', () => {
  it('lists the start position and the position after every move', () => {
    const positions = gamePositions(DEFAULT_POSITION, ['e2e4', 'e7e5']);
    expect(positions.map((p) => p.turn)).toEqual(['w', 'b', 'w']);
    expect(positions[0]?.fen).toBe(DEFAULT_POSITION);
    expect(positions.some((p) => p.final)).toBe(false);
  });

  it('marks checkmate as lost for the side to move', () => {
    const last = gamePositions(DEFAULT_POSITION, FOOLS_MATE).at(-1);
    expect(last?.final).toEqual({ score: { kind: 'mate', value: 0 }, best: null });
  });
});

describe('ReviewRunner', () => {
  it('searches the positions one by one, from the start', () => {
    const t = setup(['e2e4', 'e7e5']);
    t.runner.start();
    expect(t.requests).toEqual([{ fen: DEFAULT_POSITION, go: GO, index: 0 }]);
    answer(t, 30);
    expect(t.requests.map((r) => r.index)).toEqual([0, 1]);
    expect(t.runner.evals[0]).toEqual({ score: { kind: 'cp', value: 30 }, best: 'e2e4' });
    expect(t.updates()).toBe(1);
    answer(t, -25, 'g1f3');
    answer(t, 28);
    expect(t.runner.finished).toBe(true);
    expect(t.requests).toHaveLength(3);
  });

  it('keeps the last score of the main line only', () => {
    const t = setup(['e2e4']);
    t.runner.start();
    const job = t.requests[0] as ReviewJob;
    t.runner.handleInfo(job, info(10));
    t.runner.handleInfo(job, info(40));
    t.runner.handleInfo(job, info(-200, 2));
    t.runner.handleBestMove(job, 'e2e4');
    expect(t.runner.evals[0]?.score).toEqual({ kind: 'cp', value: 40 });
  });

  it('needs no search where the game is over', () => {
    const t = setup(FOOLS_MATE);
    t.runner.start();
    for (let i = 0; i < 4; i++) answer(t, 0);
    expect(t.requests).toHaveLength(4);
    expect(t.runner.finished).toBe(true);
  });

  it('fills positions from the cache and stores new results in it', () => {
    const cache = new Map<string, PositionEval>([
      [cacheKey(GO, DEFAULT_POSITION), { score: { kind: 'cp', value: 20 }, best: 'd2d4' }],
    ]);
    const t = setup(['e2e4'], cache);
    expect(t.runner.done).toBe(1);
    t.runner.start();
    expect(t.requests.map((r) => r.index)).toEqual([1]);
    answer(t, -20);
    expect(cache.size).toBe(2);
  });

  it('ignores output for other jobs and stops on cancel', () => {
    const t = setup(['e2e4', 'e7e5']);
    t.runner.start();
    t.runner.handleBestMove({ fen: 'x', go: GO, index: 1 }, 'e7e5');
    expect(t.runner.done).toBe(0);
    t.runner.cancel();
    expect(t.cancels()).toBe(1);
    t.runner.handleBestMove(t.requests[0] as ReviewJob, 'e2e4');
    expect(t.runner.done).toBe(0);
    expect(t.requests).toHaveLength(1);
  });

  it('carries on after a cancel when started again', () => {
    const t = setup(['e2e4']);
    t.runner.start();
    answer(t, 30);
    t.runner.cancel();
    t.runner.start();
    expect(t.requests.map((r) => r.index)).toEqual([0, 1, 1]);
  });
});
