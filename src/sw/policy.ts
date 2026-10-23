/** Runtime half of the service worker: which requests it answers and how. DOM-free, so it is tested in Node. */

/** Every cache of ours starts with this; the rest is the build's cache version. */
export const CACHE_PREFIX = 'gunnies-gambit-';

export type Strategy = 'network-first' | 'cache-first' | 'bypass';

export interface RequestLike {
  method: string;
  url: string;
  mode: string;
}

export interface ResponseLike {
  ok: boolean;
  type: string;
  redirected: boolean;
}

/**
 * Pages come from the network when it is there, so a deploy shows at once, and from the cache when it is not. All
 * other files of our own are content-hashed or versioned, so the cached copy is the right one. Everything else goes
 * straight to the network untouched: other sites (the Lichess and Chess.com game import, the analytics script),
 * anything but GET (the analytics beacon), and Cloudflare's own `/cdn-cgi/` endpoints.
 */
export function strategyFor(request: RequestLike, origin: string): Strategy {
  if (request.method !== 'GET') return 'bypass';
  const url = new URL(request.url);
  if (url.origin !== origin || url.pathname.startsWith('/cdn-cgi/')) return 'bypass';
  return request.mode === 'navigate' ? 'network-first' : 'cache-first';
}

/**
 * Only complete answers from our own origin are stored. A redirected response cannot answer a navigation, so it is
 * never stored either.
 */
export function isCacheable(response: ResponseLike): boolean {
  return response.ok && response.type === 'basic' && !response.redirected;
}

/** The URL the 404 page is precached under, relative to the service worker (see src/sw/precache.ts). */
export const NOT_FOUND_PAGE = '404';

/**
 * The cache key of a page, which is the URL it is precached under. The query string goes, so `?fen=...` links do not
 * each add a copy, and the other spellings of a page lead to the same copy: `index.html` is the home page (the
 * worker's scope), and `how-to-play.html` and `how-to-play/` are `how-to-play`.
 */
export function pageKey(url: string, scope: string): string {
  const key = new URL(url);
  key.search = '';
  key.hash = '';
  key.pathname = key.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  if (key.pathname.endsWith('/') && key.href !== scope) key.pathname = key.pathname.slice(0, -1);
  return key.href;
}

/** The page's own address for a request to it: its cache key with the request's query string, so `?fen=` links keep it. */
export function canonicalUrl(url: string, key: string): string {
  const canonical = new URL(key);
  canonical.search = new URL(url).search;
  return canonical.href;
}

/** Our caches from earlier builds, to delete once this build's worker takes over. */
export function staleCaches(names: readonly string[], current: string): string[] {
  return names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== current);
}
