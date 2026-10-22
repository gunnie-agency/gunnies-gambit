import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { boardHtml, squareColor } from './board';

describe('squareColor', () => {
  it('colours the board with a dark square at a1 and a light one at h1', () => {
    expect(squareColor('a1')).toBe('dark');
    expect(squareColor('h1')).toBe('light');
    expect(squareColor('a8')).toBe('light');
    expect(squareColor('h8')).toBe('dark');
    expect(squareColor('d4')).toBe('dark');
    expect(squareColor('e4')).toBe('light');
  });
});

/** The square names in document order. */
function squares(html: string): string[] {
  return [...html.matchAll(/data-sq="(\w\d)"/g)].map((m) => m[1] ?? '');
}

describe('boardHtml', () => {
  it('renders the start position as 64 labelled buttons with relative piece URLs', () => {
    const html = boardHtml({ game: new Chess(), orient: 'w', selected: null });
    expect(html.match(/<button /g)).toHaveLength(64);
    expect(html.match(/<img class="pc"/g)).toHaveLength(32);
    expect(html).toContain('aria-label="e1, white king"');
    expect(html).toContain('aria-label="d8, black queen"');
    expect(html).toContain('aria-label="e4"');
    expect(html).toContain('src="./pieces/cburnett/wK.svg"');
    expect(html).not.toMatch(/\b(last|sel|check|target)\b/);
  });

  it('puts a8 top left for White and h1 top left for Black, with coordinates on the left and bottom edges', () => {
    const white = boardHtml({ game: new Chess(), orient: 'w', selected: null });
    const black = boardHtml({ game: new Chess(), orient: 'b', selected: null });
    expect([squares(white)[0], squares(white)[63]]).toEqual(['a8', 'h1']);
    expect([squares(black)[0], squares(black)[63]]).toEqual(['h1', 'a8']);
    expect(white.match(/coord rank/g)).toHaveLength(8);
    expect(white.match(/coord file/g)).toHaveLength(8);
  });

  it('marks the last move, the selected piece and its legal destinations', () => {
    const game = new Chess();
    game.move('e4');
    game.move('d5');
    const html = boardHtml({ game, orient: 'w', selected: 'e4' });
    expect(html).toContain('class="sq light sel" data-sq="e4" aria-label="e4, white pawn, selected"');
    expect(html).toContain('class="sq light last target capture" data-sq="d5" aria-label="d5, black pawn, legal move"');
    expect(html).toContain('class="sq dark target" data-sq="e5" aria-label="e5, legal move"');
    expect(html).toContain('class="sq light last" data-sq="d7"');
  });
});
