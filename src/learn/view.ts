import type { Square } from 'chess.js';
import { askPromotion, closePromotion, enableArrowKeys, renderBoard } from '../board/board';
import { lessonById } from './lessons';
import { Practice } from './practice';

/**
 * Brings one practice board on the How to play page to life. The page carries the empty board, the intro text and
 * the reset button, so its layout is final before this runs; this fills in the squares and handles the moves.
 */
function mountLesson(root: HTMLElement): void {
  const lesson = lessonById(root.dataset.lesson);
  const board = root.querySelector<HTMLElement>('.board');
  const promo = root.querySelector<HTMLElement>('.promo');
  const message = root.querySelector<HTMLElement>('.lesson-msg');
  const reset = root.querySelector<HTMLButtonElement>('.lesson-reset');
  if (!lesson || !board || !promo || !message || !reset) throw new Error(`Incomplete lesson ${root.dataset.lesson}`);

  const intro = message.textContent ?? '';
  const practice = new Practice(lesson);

  const render = () => {
    const { game, selected, last } = practice;
    renderBoard(board, { game, orient: 'w', selected, last });
    message.textContent = practice.message ?? intro;
    // Every move leaves a message, so there is something to undo exactly when there is one.
    reset.disabled = practice.message === null;
  };
  const focusSquare = (sq: Square) => board.querySelector<HTMLElement>(`[data-sq="${sq}"]`)?.focus();

  board.addEventListener('click', (e) => {
    const sq = (e.target as HTMLElement).closest<HTMLElement>('[data-sq]')?.dataset.sq as Square | undefined;
    if (!sq) return;
    const pending = practice.tap(sq);
    if (pending) {
      askPromotion(promo, practice.game.turn(), (piece) => {
        if (piece) practice.play(pending.from, pending.to, piece);
        else practice.selected = null;
        render();
        focusSquare(piece ? pending.to : pending.from);
      });
    }
    render();
  });
  enableArrowKeys(board);

  reset.addEventListener('click', () => {
    closePromotion(promo);
    practice.reset();
    render();
  });

  render();
}

export function mountLessons(): void {
  document.querySelectorAll<HTMLElement>('[data-lesson]').forEach(mountLesson);
}
