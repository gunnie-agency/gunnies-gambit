import { LESSONS, type Lesson } from './lessons';

const KEY = 'gunnies-gambit.lessons.v1';

/** Lessons with a goal the reader can reach, which the page counts as solved once they do. */
export function hasGoal(lesson: Lesson | undefined): boolean {
  return lesson?.mode === 'puzzle';
}

const GOALS = new Set(LESSONS.filter(hasGoal).map((lesson) => lesson.id));

/** The known lesson ids in a stored value. Anything else, such as a puzzle that no longer exists, is dropped. */
export function parseSolved(raw: unknown): Set<string> {
  const ids = (raw as { solved?: unknown } | null)?.solved;
  if (!Array.isArray(ids)) return new Set();
  return new Set(ids.filter((id): id is string => typeof id === 'string' && GOALS.has(id)));
}

/** How many of a section's lessons are solved, as the page shows it. */
export function progressText(ids: readonly string[], solved: ReadonlySet<string>): string {
  return `${ids.filter((id) => solved.has(id)).length} of ${ids.length} solved`;
}

/** Reads which lessons this browser has solved. Storage is a convenience, so anything odd counts as none. */
export function loadSolved(): Set<string> {
  try {
    return parseSolved(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return new Set();
  }
}

export function saveSolved(solved: ReadonlySet<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ solved: [...solved] }));
  } catch {
    // Private mode or storage full: the progress just isn't remembered.
  }
}
