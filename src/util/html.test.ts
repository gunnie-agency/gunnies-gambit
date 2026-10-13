import { describe, expect, it } from 'vitest';
import { escapeHtml } from './html';

describe('escapeHtml', () => {
  it('escapes markup and double quotes and leaves other text alone', () => {
    expect(escapeHtml(`<b class="x">Tom & Jerry's</b>`)).toBe(
      "&lt;b class=&quot;x&quot;&gt;Tom &amp; Jerry's&lt;/b&gt;",
    );
  });
});
