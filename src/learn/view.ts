import type { Square } from 'chess.js';
import { askPromotion, closePromotion, enableArrowKeys, renderBoard } from '../board/board';
import { LEVELS } from '../engine/levels';
import { buildPracticeLink } from '../util/link';
import { FIRST_GAME, lessonById } from './lessons';
import { Practice } from './practice';
import { hasGoal, loadSolved, progressText, saveSolved } from './progress';

/** How long a board waits before the other side answers, so the reader sees their own move land first. */
const REPLY_DELAY_MS = 600;

/** Endgames are practised against the strongest level, which defends as well as it can. */
const PRACTICE_LEVEL = LEVELS.at(-1)?.id ?? 'max';

/** The lessons this browser has solved, and what to do when one more is. */
interface Progress {
  solved: ReadonlySet<string>;
  record(id: string): void;
}

/**
 * Brings one practice board on the How to play page to life. The page carries the empty board, the intro text and
 * the buttons, so its layout is final before this runs; this fills in the squares and handles the moves.
 */
function mountLesson(root: HTMLElement, progress: Progress): void {
  const lesson = lessonById(root.dataset.lesson);
  const board = root.querySelector<HTMLElement>('.board');
  const promo = root.querySelector<HTMLElement>('.promo');
  const message = root.querySelector<HTMLElement>('.lesson-msg');
  const reset = root.querySelector<HTMLButtonElement>('.lesson-reset');
  const hint = root.querySelector<HTMLButtonElement>('.lesson-hint');
  if (!lesson || !board || !promo || !message || !reset) throw new Error(`Incomplete lesson ${root.dataset.lesson}`);
  if (lesson.mode === 'puzzle' && !hint) throw new Error(`Puzzle ${lesson.id} has no hint button`);
  if (hasGoal(lesson) && !root.querySelector('.lesson-solved'))
    throw new Error(`Lesson ${lesson.id} has no solved mark`);
  if (lesson.practiseAs) {
    const link = root.querySelector<HTMLAnchorElement>('.lesson-practise');
    if (!link) throw new Error(`Endgame ${lesson.id} has no practice link`);
    link.href = buildPracticeLink(lesson.fen, lesson.practiseAs, PRACTICE_LEVEL);
  }

  const intro = message.textContent ?? '';
  const resetLabel = reset.textContent;
  const practice = new Practice(lesson);
  let replyTimer: ReturnType<typeof setTimeout> | undefined;
  /** The pawn waiting in the promotion picker, so a cancel can give it focus back. */
  let promoting: Square | null = null;

  const render = () => {
    const { game, side, selected, last } = practice;
    renderBoard(board, { game, orient: side, selected, last });
    if (practice.hint) markHint(board, practice.hint);
    message.textContent = practice.message ?? intro;
    // Every move leaves a message, and so does a move that is refused or taken back: Start again clears it.
    reset.disabled = practice.message === null;
    if (hasGoal(lesson)) reset.textContent = practice.done ? 'Again' : resetLabel;
    if (hint) hint.disabled = practice.done || practice.waiting;
    if (practice.solved && !progress.solved.has(lesson.id)) progress.record(lesson.id);
    root.classList.toggle('solved', progress.solved.has(lesson.id));
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
      promoting = pending.from;
      askPromotion(promo, practice.game.turn(), (piece) => {
        promoting = null;
        if (piece) practice.play(pending.from, pending.to, piece);
        else practice.selected = null;
        render();
        focusSquare(piece ? pending.to : pending.from);
      });
    }
    render();
  });
  enableArrowKeys(board);

  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !promoting) return;
    const pawn = promoting;
    promoting = null;
    closePromotion(promo);
    practice.selected = null;
    render();
    focusSquare(pawn);
  });

  hint?.addEventListener('click', () => {
    practice.showHint();
    render();
  });

  reset.addEventListener('click', () => {
    clearTimeout(replyTimer);
    replyTimer = undefined;
    promoting = null;
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

/** Fills in each section's "n of m solved" line (or its own `data-label`), which the page renders with none solved. */
function showProgress(solved: ReadonlySet<string>): void {
  for (const line of document.querySelectorAll<HTMLElement>('.lesson-progress')) {
    const ids = [...(line.closest('section')?.querySelectorAll<HTMLElement>('[data-lesson]') ?? [])]
      .map((el) => el.dataset.lesson ?? '')
      .filter((id) => hasGoal(lessonById(id)));
    line.textContent = progressText(ids, solved, line.dataset.label);
  }
}

export function mountLessons(): void {
  const solved = loadSolved();
  const progress: Progress = {
    solved,
    record(id) {
      solved.add(id);
      saveSolved(solved);
      showProgress(solved);
    },
  };
  document.querySelectorAll<HTMLElement>('[data-lesson]').forEach((root) => mountLesson(root, progress));
  const firstGame = document.querySelector<HTMLAnchorElement>('.first-game');
  if (firstGame) firstGame.href = buildPracticeLink(FIRST_GAME.fen, FIRST_GAME.side, FIRST_GAME.level);
  showProgress(solved);
}
