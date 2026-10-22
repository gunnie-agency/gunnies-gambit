import type { Square } from 'chess.js';
import { askPromotion, closePromotion, enableArrowKeys, renderBoard } from '../board/board';
import { LEVELS } from '../engine/levels';
import { buildPracticeLink } from '../util/link';
import { lessonById } from './lessons';
import { Practice } from './practice';

/** How long a puzzle waits before Black answers, so the reader sees their own move land first. */
const REPLY_DELAY_MS = 600;

/** Endgames are practised against the strongest level, which defends as well as it can. */
const PRACTICE_LEVEL = LEVELS.at(-1)?.id ?? 'max';

/**
 * Brings one practice board on the How to play page to life. The page carries the empty board, the intro text and
 * the buttons, so its layout is final before this runs; this fills in the squares and handles the moves.
 */
function mountLesson(root: HTMLElement): void {
  const lesson = lessonById(root.dataset.lesson);
  const board = root.querySelector<HTMLElement>('.board');
  const promo = root.querySelector<HTMLElement>('.promo');
  const message = root.querySelector<HTMLElement>('.lesson-msg');
  const reset = root.querySelector<HTMLButtonElement>('.lesson-reset');
  const hint = root.querySelector<HTMLButtonElement>('.lesson-hint');
  if (!lesson || !board || !promo || !message || !reset) throw new Error(`Incomplete lesson ${root.dataset.lesson}`);
  if (lesson.mode === 'puzzle' && !hint) throw new Error(`Puzzle ${lesson.id} has no hint button`);
  if (lesson.practiseAs) {
    const link = root.querySelector<HTMLAnchorElement>('.lesson-practise');
    if (!link) throw new Error(`Endgame ${lesson.id} has no practice link`);
    link.href = buildPracticeLink(lesson.fen, lesson.practiseAs, PRACTICE_LEVEL);
  }

  const intro = message.textContent ?? '';
  const resetLabel = reset.textContent;
  const practice = new Practice(lesson);
  let replyTimer: ReturnType<typeof setTimeout> | undefined;

  const render = () => {
    const { game, selected, last } = practice;
    renderBoard(board, { game, orient: 'w', selected, last });
    if (practice.hint) markHint(board, practice.hint);
    message.textContent = practice.message ?? intro;
    // Every move leaves a message, so there is something to undo exactly when there is one.
    reset.disabled = practice.message === null;
    if (lesson.mode === 'puzzle') reset.textContent = practice.done ? 'Again' : resetLabel;
    if (hint) hint.disabled = practice.done || practice.waiting;
    if (practice.waiting && replyTimer === undefined) {
      replyTimer = setTimeout(() => {
        replyTimer = undefined;
        practice.reply();
        render();
      }, REPLY_DELAY_MS);
    }
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

  hint?.addEventListener('click', () => {
    practice.showHint();
    render();
  });

  reset.addEventListener('click', () => {
    clearTimeout(replyTimer);
    replyTimer = undefined;
    closePromotion(promo);
    practice.reset();
    render();
  });

  render();
}

/** Rings the square of the piece a hint points at, for sight and for screen readers. */
function markHint(board: HTMLElement, sq: Square): void {
  const button = board.querySelector<HTMLElement>(`[data-sq="${sq}"]`);
  button?.classList.add('hint');
  button?.setAttribute('aria-label', `${button.getAttribute('aria-label') ?? sq}, hint`);
}

export function mountLessons(): void {
  document.querySelectorAll<HTMLElement>('[data-lesson]').forEach(mountLesson);
}
