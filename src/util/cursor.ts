/**
 * Which position of the game the board shows outside review. `null` is the live position, after the last move;
 * a number is an earlier position, given as the number of moves played up to it (0 is the start position).
 */
export type View = number | null;

export type Step = 'first' | 'prev' | 'next' | 'last';

/** The keys that step through the move list, as in the review. */
export const STEP_KEYS: Readonly<Record<string, Step>> = {
  ArrowLeft: 'prev',
  ArrowRight: 'next',
  Home: 'first',
  End: 'last',
};

/** The view showing the position after `moves` of `total` moves: the live position once it reaches the end. */
export function viewAt(moves: number, total: number): View {
  if (!Number.isFinite(moves)) return null;
  const clamped = Math.max(0, Math.trunc(moves));
  return clamped >= total ? null : clamped;
}

/** The number of moves played up to the shown position. */
export function shownMoves(view: View, total: number): number {
  return view ?? total;
}

/** The view after one step through a game of `total` moves. */
export function stepView(view: View, total: number, step: Step): View {
  const current = shownMoves(view, total);
  const target = { first: 0, prev: current - 1, next: current + 1, last: total }[step];
  return viewAt(target, total);
}

/** A view that still fits a game that has changed length: past the end it becomes the live position. */
export function clampView(view: View, total: number): View {
  return view === null ? null : viewAt(view, total);
}

/** A move with its number, as in `12. Nf3` or `12… Nf6`, from the position before it. */
export function moveName(fenBefore: string, san: string): string {
  const fields = fenBefore.split(' ');
  return `${fields[5] ?? '1'}${fields[1] === 'b' ? '…' : '.'} ${san}`;
}
