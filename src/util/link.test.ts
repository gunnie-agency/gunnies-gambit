import { describe, expect, it } from 'vitest';
import { buildPracticeLink, parsePracticeLink } from './link';

const FEN = '8/4k3/8/4K3/8/4P3/8/8 w - - 0 1';
const ENCODED = encodeURIComponent(FEN);

describe('buildPracticeLink', () => {
  it('encodes the position and names mode, side and level', () => {
    expect(buildPracticeLink(FEN, 'w', 'max')).toBe(
      './#fen=8%2F4k3%2F8%2F4K3%2F8%2F4P3%2F8%2F8%20w%20-%20-%200%201&mode=play&side=w&level=max',
    );
  });
});

describe('parsePracticeLink', () => {
  const hashOf = (link: string) => link.slice(link.indexOf('#'));

  it('reads back what buildPracticeLink wrote', () => {
    expect(parsePracticeLink(hashOf(buildPracticeLink(FEN, 'b', 'elo1400')))).toEqual({
      fen: FEN,
      side: 'b',
      level: 'elo1400',
    });
  });

  it('accepts a hash without the leading #', () => {
    expect(parsePracticeLink(hashOf(buildPracticeLink(FEN, 'w', 'max')).slice(1))?.fen).toBe(FEN);
  });

  it.each([
    ['an empty hash', ''],
    ['a missing fen', '#mode=play&side=w&level=max'],
    ['another mode', `#fen=${ENCODED}&mode=analyse&side=w&level=max`],
    ['a missing mode', `#fen=${ENCODED}&side=w&level=max`],
    ['an unknown side', `#fen=${ENCODED}&mode=play&side=white&level=max`],
    ['an unknown level', `#fen=${ENCODED}&mode=play&side=w&level=grandmaster`],
    ['a missing level', `#fen=${ENCODED}&mode=play&side=w`],
    ['a malformed fen', `#fen=${encodeURIComponent('8/8/8 w - - 0 1')}&mode=play&side=w&level=max`],
    [
      'a fen without a black king',
      `#fen=${encodeURIComponent('8/8/8/4K3/8/4P3/8/8 w - - 0 1')}&mode=play&side=w&level=max`,
    ],
    [
      'a position where the side not to move is in check',
      `#fen=${encodeURIComponent('4k3/8/8/8/8/8/8/q3K3 b - - 0 1')}&mode=play&side=w&level=max`,
    ],
  ])('returns null for %s', (_, hash) => {
    expect(parsePracticeLink(hash)).toBeNull();
  });
});
