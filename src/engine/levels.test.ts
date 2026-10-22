import { describe, expect, it } from 'vitest';
import { DEFAULT_LEVEL_ID, LEVELS, levelById } from './levels';

describe('LEVELS', () => {
  it('keeps the ids that saved settings and practice links use', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(['beginner', 'novice', 'elo1400', 'elo1700', 'elo2000', 'elo2400', 'max']);
  });

  it('says what each rating means, briefly enough for a phone', () => {
    expect(levelById('elo2400').label).toBe('Elo 2400 · master');
    for (const level of LEVELS) expect(level.label.length).toBeLessThanOrEqual(24);
  });

  it('falls back to the default level for an unknown id', () => {
    expect(levelById('elo9999').id).toBe(DEFAULT_LEVEL_ID);
  });
});
