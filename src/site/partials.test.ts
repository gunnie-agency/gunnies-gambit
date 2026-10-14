import { describe, expect, it } from 'vitest';
import { footerHtml, logoSymbol } from './partials';

describe('logoSymbol', () => {
  it('defines the logo once, with its crop on the symbol', () => {
    const svg = logoSymbol();
    expect(svg.match(/<symbol /g)).toHaveLength(1);
    expect(svg).toContain('<symbol id="gunnie-logo" viewBox="3 19 493 97">');
  });
});

describe('footerHtml', () => {
  it('carries the fair-play rule and links both pages', () => {
    const html = footerHtml("Gunnie's Gambit");
    expect(html).toContain('is against the rules and gets accounts');
    expect(html).toContain('href="./how-to-play"');
    expect(html).toContain('href="./"');
  });

  it('escapes the app name', () => {
    expect(footerHtml('<b>')).toContain('&lt;b&gt; is for practice');
  });
});
