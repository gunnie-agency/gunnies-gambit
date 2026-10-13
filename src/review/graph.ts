import type { Judgement } from './classify';

/** Size of the graph's coordinate system. It is drawn stretched to the panel width, so lines use non-scaling strokes. */
export const GRAPH_WIDTH = 600;
export const GRAPH_HEIGHT = 80;

/** X position of a game position (0 is the start position) in a game with `count` positions. */
function xOf(index: number, count: number): number {
  return count > 1 ? (index / (count - 1)) * GRAPH_WIDTH : 0;
}

/** Y position of White's winning chances, from 1 (top) to -1 (bottom). */
function yOf(chances: number): number {
  return ((1 - chances) / 2) * GRAPH_HEIGHT;
}

const f = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * The inner markup of the eval graph: White's share filled from the bottom, the 0 line, a mark for every judged move
 * at the position it led to, and the current position. Positions not evaluated yet are skipped.
 *
 * @param chances White's winning chances per position, -1..1
 * @param judgements Per move: the judgement of the move from position i to position i + 1
 * @param current The position shown on the board
 */
export function graphMarkup(
  chances: ReadonlyArray<number | undefined>,
  judgements: ReadonlyArray<Judgement | null | undefined>,
  current: number,
): string {
  const count = chances.length;
  const points = chances.flatMap((c, i) => (c === undefined ? [] : [`${f(xOf(i, count))},${f(yOf(c))}`]));
  let svg = `<rect class="graph-bg" width="${GRAPH_WIDTH}" height="${GRAPH_HEIGHT}"/>`;
  if (points.length) {
    const first = points[0]?.split(',')[0] ?? '0';
    const last = points.at(-1)?.split(',')[0] ?? '0';
    svg += `<path class="graph-area" d="M${first},${GRAPH_HEIGHT} L${points.join(' L')} L${last},${GRAPH_HEIGHT} Z"/>`;
  }
  const mid = GRAPH_HEIGHT / 2;
  svg += `<line class="graph-mid" x1="0" y1="${mid}" x2="${GRAPH_WIDTH}" y2="${mid}" vector-effect="non-scaling-stroke"/>`;
  judgements.forEach((j, move) => {
    if (!j) return;
    const x = f(xOf(move + 1, count));
    svg += `<line class="graph-mark ${j}" x1="${x}" y1="0" x2="${x}" y2="${GRAPH_HEIGHT}" vector-effect="non-scaling-stroke"/>`;
  });
  const x = f(xOf(current, count));
  svg += `<line class="graph-cur" x1="${x}" y1="0" x2="${x}" y2="${GRAPH_HEIGHT}" vector-effect="non-scaling-stroke"/>`;
  return svg;
}

/** The position nearest to a click at `fraction` (0..1) of the graph's width. */
export function positionAt(fraction: number, count: number): number {
  if (count < 2) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(fraction * (count - 1))));
}
