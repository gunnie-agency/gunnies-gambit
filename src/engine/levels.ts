import type { OptionValue } from './queue';

export interface Level {
  id: string;
  label: string;
  /** Options sent before every move search, so switching levels mid-game always takes effect. */
  options: Record<string, OptionValue>;
  go: string;
}

/**
 * Opponent strengths. Stockfish's `UCI_Elo` starts at 1320, so the two lowest levels use
 * `Skill Level` 0 with a very shallow search instead, which makes the engine miss simple tactics.
 */
export const LEVELS: readonly Level[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    options: { MultiPV: 1, UCI_LimitStrength: false, 'Skill Level': 0 },
    go: 'depth 1',
  },
  {
    id: 'novice',
    label: 'Novice',
    options: { MultiPV: 1, UCI_LimitStrength: false, 'Skill Level': 2 },
    go: 'depth 3',
  },
  ...(
    [
      [1400, 'casual player'],
      [1700, 'club player'],
      [2000, 'expert'],
      [2400, 'master'],
    ] as const
  ).map(([elo, who]) => ({
    id: `elo${elo}`,
    // Short enough for the select on a phone; the rating alone means little to a beginner.
    label: `Elo ${elo} · ${who}`,
    options: { MultiPV: 1, 'Skill Level': 20, UCI_LimitStrength: true, UCI_Elo: elo },
    go: 'movetime 1000',
  })),
  {
    id: 'max',
    label: 'Full strength',
    options: { MultiPV: 1, 'Skill Level': 20, UCI_LimitStrength: false },
    go: 'movetime 2000',
  },
];

export const DEFAULT_LEVEL_ID = 'novice';

export function levelById(id: string): Level {
  return LEVELS.find((l) => l.id === id) ?? (LEVELS.find((l) => l.id === DEFAULT_LEVEL_ID) as Level);
}
