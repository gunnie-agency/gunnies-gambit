import { DEFAULT_POSITION } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { PositionEval } from './classify';
import { cacheKey, gamePositions, REVIEW_OPTIONS, ReviewRunner, reviewWorkerCount, type ReviewJob } from './runner';

const GO = 'nodes 1000';
const info = (value: number, multipv = 1) => ({
  depth: 10,
  multipv,
  score: { kind: 'cp' as const, value },
  pv: ['e2e4'],
});
// Fool's mate: the last position is checkmate and needs no search.
const FOOLS_MATE = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];

function setup(moves: string[], cache = new Map<string, PositionEval>(), workers = 1) {
  const requests: ReviewJob[] = [];
  const engines = Array.from({ length: workers }, () => ({
    jobs: [] as ReviewJob[],
    cancels: 0,
    request(job: ReviewJob) {
      this.jobs.push(job);
      requests.push(job);
    },
    cancel() {
      this.cancels++;
    },
  }));
  let updates = 0;
  const runner = new ReviewRunner(engines, gamePositions(DEFAULT_POSITION, moves), GO, cache, () => updates++);
  const cancels = () => engines.reduce((n, e) => n + e.cancels, 0);
  return { runner, engines, requests, cache, cancels, updates: () => updates };
}

/** Plays the engine's part for a job, by default the latest request. */
function answer(t: ReturnType<typeof setup>, score: number, best = 'e2e4', job = t.requests.at(-1) as ReviewJob) {
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
    expect(t.requests).toEqual([{ fen: DEFAULT_POSITION, go: GO, options: REVIEW_OPTIONS, index: 0 }]);
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

  it('does not use results stored before every search cleared the hash', () => {
    const old = { score: { kind: 'cp' as const, value: 20 }, best: 'd2d4' };
    const t = setup(['e2e4'], new Map([[`${GO}|${DEFAULT_POSITION}`, old]]));
    expect(t.runner.done).toBe(0);
  });

  it('ignores output for other jobs and stops on cancel', () => {
    const t = setup(['e2e4', 'e7e5']);
    t.runner.start();
    t.runner.handleBestMove({ fen: 'x', go: GO, index: 1 }, 'e7e5');
    t.runner.handleBestMove({ ...(t.requests[0] as ReviewJob) }, 'e2e4');
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

  it('keeps one search running per engine', () => {
    const t = setup(['e2e4', 'e7e5', 'g1f3'], undefined, 2);
    t.runner.start();
    expect(t.engines.map((e) => e.jobs.map((j) => j.index))).toEqual([[0], [1]]);
    answer(t, 30, 'e2e4', t.engines[0]?.jobs[0]);
    expect(t.engines.map((e) => e.jobs.map((j) => j.index))).toEqual([[0, 2], [1]]);
    expect(t.runner.done).toBe(1);
  });

  it('takes results in any order', () => {
    const t = setup(['e2e4', 'e7e5'], undefined, 2);
    t.runner.start();
    const [first, second] = t.requests as [ReviewJob, ReviewJob];
    t.runner.handleInfo(first, info(30));
    t.runner.handleInfo(second, info(-25));
    t.runner.handleBestMove(second, 'g1f3');
    expect(t.runner.evals[1]).toEqual({ score: { kind: 'cp', value: -25 }, best: 'g1f3' });
    expect(t.runner.evals[0]).toBeUndefined();
    expect(t.engines[1]?.jobs.map((j) => j.index)).toEqual([1, 2]);
    t.runner.handleBestMove(first, 'e2e4');
    expect(t.runner.evals[0]).toEqual({ score: { kind: 'cp', value: 30 }, best: 'e2e4' });
    answer(t, 28);
    expect(t.runner.finished).toBe(true);
    expect(t.requests).toHaveLength(3);
  });

  it('cancels every running search and ignores their late output', () => {
    const t = setup(['e2e4', 'e7e5', 'g1f3'], undefined, 3);
    t.runner.start();
    answer(t, 10, 'e2e4', t.requests[2]);
    t.runner.cancel();
    expect(t.cancels()).toBe(3);
    for (const job of t.requests) answer(t, 0, 'e2e4', job);
    expect(t.runner.done).toBe(1);
    expect(t.requests).toHaveLength(4);
    t.runner.start();
    expect(t.requests.slice(4).map((r) => r.index)).toEqual([0, 1, 3]);
  });

  it('searches only the positions missing from the cache, spread over the engines', () => {
    const positions = gamePositions(DEFAULT_POSITION, ['e2e4', 'e7e5', 'g1f3']);
    const cached: PositionEval = { score: { kind: 'cp', value: 20 }, best: null };
    const cache = new Map([0, 2].map((i) => [cacheKey(GO, positions[i]?.fen ?? ''), cached]));
    const t = setup(['e2e4', 'e7e5', 'g1f3'], cache, 3);
    t.runner.start();
    expect(t.requests.map((r) => r.index)).toEqual([1, 3]);
    expect(t.engines[2]?.jobs).toEqual([]);
  });

  it('moves the search of a failed engine to another one', () => {
    const t = setup(['e2e4', 'e7e5'], undefined, 2);
    t.runner.start();
    const [broken, working] = t.engines;
    if (!broken || !working) throw new Error('two engines expected');
    t.runner.removeEngine(broken);
    answer(t, 0, 'e7e5', working.jobs[0]);
    expect(working.jobs.map((j) => j.index)).toEqual([1, 0]);
    answer(t, 0);
    answer(t, 0);
    expect(working.jobs.map((j) => j.index)).toEqual([1, 0, 2]);
    expect(t.runner.finished).toBe(true);
  });
});

describe('reviewWorkerCount', () => {
  it('uses two workers from four cores and a third only with plenty of memory', () => {
    expect(reviewWorkerCount(2)).toBe(1);
    expect(reviewWorkerCount(4)).toBe(2);
    expect(reviewWorkerCount(8)).toBe(2);
    expect(reviewWorkerCount(8, 4)).toBe(2);
    expect(reviewWorkerCount(8, 8)).toBe(3);
    expect(reviewWorkerCount(4, 8)).toBe(2);
  });
});
