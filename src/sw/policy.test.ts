import { describe, expect, it } from 'vitest';
import { isCacheable, pageKey, staleCaches, strategyFor } from './policy';

const ORIGIN = 'https://chess.gunnie.nl';
const get = (url: string, mode = 'no-cors') => ({ method: 'GET', url, mode });

describe('strategyFor', () => {
  it('serves pages network-first and our own files cache-first', () => {
    expect(strategyFor(get(`${ORIGIN}/how-to-play`, 'navigate'), ORIGIN)).toBe('network-first');
    expect(strategyFor(get(`${ORIGIN}/assets/index-AbC123.js`, 'cors'), ORIGIN)).toBe('cache-first');
    expect(strategyFor(get(`${ORIGIN}/stockfish/stockfish-19.0.1-lite-single.wasm`, 'same-origin'), ORIGIN)).toBe(
      'cache-first',
    );
  });

  it('leaves the game import, the analytics and anything but GET to the network', () => {
    expect(strategyFor(get('https://lichess.org/api/games/user/someone', 'cors'), ORIGIN)).toBe('bypass');
    expect(strategyFor(get('https://api.chess.com/pub/player/someone/games/archives', 'cors'), ORIGIN)).toBe('bypass');
    expect(strategyFor(get('https://static.cloudflareinsights.com/beacon.min.js'), ORIGIN)).toBe('bypass');
    expect(
      strategyFor({ method: 'POST', url: 'https://cloudflareinsights.com/cdn-cgi/rum', mode: 'cors' }, ORIGIN),
    ).toBe('bypass');
    expect(strategyFor(get(`${ORIGIN}/cdn-cgi/rum`), ORIGIN)).toBe('bypass');
    expect(strategyFor({ method: 'POST', url: `${ORIGIN}/`, mode: 'navigate' }, ORIGIN)).toBe('bypass');
  });
});

describe('isCacheable', () => {
  it('stores only complete, same-origin, unredirected answers', () => {
    expect(isCacheable({ ok: true, type: 'basic', redirected: false })).toBe(true);
    expect(isCacheable({ ok: false, type: 'basic', redirected: false })).toBe(false);
    expect(isCacheable({ ok: true, type: 'opaque', redirected: false })).toBe(false);
    expect(isCacheable({ ok: true, type: 'basic', redirected: true })).toBe(false);
  });
});

describe('pageKey', () => {
  it('drops the query string and the fragment', () => {
    expect(pageKey(`${ORIGIN}/?fen=8/8/8/8/8/8/8/8%20w%20-%20-#x`)).toBe(`${ORIGIN}/`);
    expect(pageKey(`${ORIGIN}/how-to-play`)).toBe(`${ORIGIN}/how-to-play`);
  });
});

describe('staleCaches', () => {
  it('lists our caches from other builds and nothing else', () => {
    const names = ['gunnies-gambit-aaa', 'gunnies-gambit-bbb', 'someone-else'];
    expect(staleCaches(names, 'gunnies-gambit-bbb')).toEqual(['gunnies-gambit-aaa']);
  });
});
