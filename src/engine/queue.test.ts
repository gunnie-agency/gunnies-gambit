import { describe, expect, it } from 'vitest';
import { SearchQueue, type SearchJob } from './queue';

const A = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const B = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const C = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const INFO = 'info depth 10 multipv 1 score cp 30 pv e2e4 e7e5';

function setup() {
  const sent: string[] = [];
  const infos: string[] = [];
  const best: Array<[string, string | null]> = [];
  const busy: boolean[] = [];
  const queue = new SearchQueue<SearchJob>((c) => sent.push(c), {
    onInfo: (job) => infos.push(job.fen),
    onBestMove: (job, move) => best.push([job.fen, move]),
    onBusyChange: (b) => busy.push(b),
  });
  return { queue, sent, infos, best, busy };
}

describe('SearchQueue', () => {
  it('waits for the engine to be ready before searching', () => {
    const { queue, sent } = setup();
    queue.request({ fen: A, go: 'movetime 1000' });
    expect(sent).toEqual([]);
    queue.setReady();
    expect(sent).toEqual([`position fen ${A}`, 'go movetime 1000']);
  });

  it('sends job options before the position', () => {
    const { queue, sent } = setup();
    queue.setReady();
    queue.request({ fen: A, go: 'depth 3', options: { UCI_LimitStrength: true, UCI_Elo: 1500 } });
    expect(sent).toEqual([
      'setoption name UCI_LimitStrength value true',
      'setoption name UCI_Elo value 1500',
      `position fen ${A}`,
      'go depth 3',
    ]);
  });

  it('reports info and bestmove for a search that finishes', () => {
    const { queue, infos, best, busy } = setup();
    queue.setReady();
    queue.request({ fen: A, go: 'movetime 1000' });
    queue.handleLine(INFO);
    queue.handleLine('bestmove e2e4 ponder e7e5');
    expect(infos).toEqual([A]);
    expect(best).toEqual([[A, 'e2e4']]);
    expect(busy).toEqual([true, false]);
    expect(queue.busy).toBe(false);
  });

  it('stops the running search and starts only the latest request after bestmove', () => {
    const { queue, sent, infos, best, busy } = setup();
    queue.setReady();
    queue.request({ fen: A, go: 'movetime 1000' });
    sent.length = 0;

    queue.request({ fen: B, go: 'movetime 1000' });
    queue.request({ fen: C, go: 'movetime 1000' });
    expect(sent).toEqual(['stop']);

    // Late output from the stopped search must not be attributed to anything.
    queue.handleLine(INFO);
    queue.handleLine('bestmove e2e4');
    expect(infos).toEqual([]);
    expect(best).toEqual([]);
    expect(sent).toEqual(['stop', `position fen ${C}`, 'go movetime 1000']);

    queue.handleLine(INFO);
    queue.handleLine('bestmove g1f3');
    expect(infos).toEqual([C]);
    expect(best).toEqual([[C, 'g1f3']]);
    expect(busy).toEqual([true, false]);
  });

  it('cancel stops the search and drops its result', () => {
    const { queue, sent, best } = setup();
    queue.setReady();
    queue.request({ fen: A, go: 'movetime 1000' });
    queue.cancel();
    queue.cancel();
    expect(sent.filter((c) => c === 'stop')).toHaveLength(1);
    queue.handleLine('bestmove e2e4');
    expect(best).toEqual([]);
    expect(queue.busy).toBe(false);
  });

  it('reports a null move when the position has no legal moves', () => {
    const { queue, best } = setup();
    queue.setReady();
    queue.request({ fen: A, go: 'depth 1' });
    queue.handleLine('bestmove (none)');
    expect(best).toEqual([[A, null]]);
  });

  it('ignores stray bestmove lines when idle', () => {
    const { queue, best, busy } = setup();
    queue.setReady();
    queue.handleLine('bestmove e2e4');
    expect(best).toEqual([]);
    expect(busy).toEqual([false]);
  });
});
