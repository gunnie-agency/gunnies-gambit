import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { boardHtml, defaultTabStop, squareColor } from './board';

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
    expect(white).toContain(
      'data-sq="a1" aria-label="a1, white rook" tabindex="-1"><span class="coord rank" data-coord="1"',
    );
    expect(black).toMatch(/data-sq="h8"[^>]*><span class="coord rank" data-coord="8" aria-hidden="true"><\/span>/);
  });

  it('gives the square buttons no text of their own, so what they show is what their label says', () => {
    const html = boardHtml({ game: new Chess(), orient: 'w', selected: null });
    // Every tag is followed by another tag: the coordinates come from the stylesheet.
    expect(html).not.toMatch(/>[^<]/);
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

/** The squares in the tab order. */
function tabStops(html: string): string[] {
  return [...html.matchAll(/data-sq="(\w\d)"[^>]*tabindex="0"/g)].map((m) => m[1] ?? '');
}

describe('tab order', () => {
  it('puts one square of the board in the tab order and the other 63 out of it', () => {
    const html = boardHtml({ game: new Chess(), orient: 'w', selected: null });
    expect(tabStops(html)).toEqual(['e1']);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(63);
  });

  it('keeps the tab stop on the square it is given', () => {
    expect(tabStops(boardHtml({ game: new Chess(), orient: 'b', selected: null }, 'c6'))).toEqual(['c6']);
  });

  it('defaults to the selected piece, else the king of the side to move', () => {
    const game = new Chess();
    expect(defaultTabStop({ game, orient: 'w', selected: 'g1' })).toBe('g1');
    game.move('e4');
    expect(defaultTabStop({ game, orient: 'w', selected: null })).toBe('e8');
  });

  it('falls back to a piece of the side to move, then to the bottom-left corner', () => {
    const rook = new Chess('8/8/8/8/3R4/8/8/8 w - - 0 1', { skipValidation: true });
    expect(defaultTabStop({ game: rook, orient: 'w', selected: null })).toBe('d4');
    const empty = new Chess('8/8/8/8/8/8/8/8 w - - 0 1', { skipValidation: true });
    expect(defaultTabStop({ game: empty, orient: 'w', selected: null })).toBe('a1');
    expect(defaultTabStop({ game: empty, orient: 'b', selected: null })).toBe('h8');
  });
});
