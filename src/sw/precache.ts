import { createHash } from 'node:crypto';

/**
 * Build-time half of the service worker: which built files it stores on install, under which URL, and the version
 * that names its cache. Paths are relative to the build output and use forward slashes.
 */

export interface PrecacheEntry {
  /** The file in the build output. */
  file: string;
  /** The URL it is served at, relative to the service worker. */
  url: string;
}

/** Placeholders in the built service worker, replaced by the precache list and the cache version. */
export const PRECACHE_PLACEHOLDER = '__SW_PRECACHE__';
export const VERSION_PLACEHOLDER = '__SW_VERSION__';

/** Icons and the manifest, named in the page heads and the manifest itself. */
const ROOT_FILES = /^(?:manifest\.webmanifest|favicon\.(?:ico|svg)|apple-touch-icon\.png|icon-[\w-]+\.png)$/;

/**
 * The URL a page is served at: Cloudflare serves `how-to-play.html` as `/how-to-play`, and the home page as `/`.
 * Caching the URL the browser navigates to is what lets the network-first lookup find it offline.
 */
function pageUrl(file: string): string {
  return file === 'index.html' ? './' : file.slice(0, -'.html'.length);
}

function isPrecached(file: string): boolean {
  if (file.endsWith('.html')) return !file.includes('/');
  // Every browser with service workers reads WOFF2, so the WOFF fallbacks would only take up space.
  if (file.startsWith('assets/')) return !file.endsWith('.woff') && !file.endsWith('.map');
  if (file.startsWith('stockfish/') || file.startsWith('pieces/')) return true;
  return ROOT_FILES.test(file);
}

/**
 * Everything the app needs to start and run offline: both pages, the 404 page (the offline answer to an unknown
 * address), the hashed bundle (scripts, styles, fonts), the engine, the pieces, the icons and the manifest. Not the
 * social card or the files meant for crawlers.
 */
export function precacheEntries(files: readonly string[]): PrecacheEntry[] {
  return files
    .filter(isPrecached)
    .sort((a, b) => a.localeCompare(b))
    .map((file) => ({ file, url: file.endsWith('.html') ? pageUrl(file) : file }));
}

/**
 * A short hash of the precached URLs and their contents, so every deploy that changes what is cached gets a cache
 * of its own and the service worker file changes with it, which is what makes the browser install the new one.
 */
export function cacheVersion(entries: readonly { url: string; content: string | Uint8Array }[]): string {
  const hash = createHash('sha256');
  for (const { url, content } of entries) hash.update(url).update('\0').update(content).update('\0');
  return hash.digest('hex').slice(0, 12);
}

/** Puts the precache list and the version into the built service worker. */
export function fillServiceWorker(code: string, urls: readonly string[], version: string): string {
  for (const placeholder of [PRECACHE_PLACEHOLDER, VERSION_PLACEHOLDER]) {
    if (!code.includes(placeholder)) throw new Error(`service-worker: ${placeholder} missing from the built sw.js`);
  }
  return code
    .replaceAll(PRECACHE_PLACEHOLDER, JSON.stringify(urls))
    .replaceAll(VERSION_PLACEHOLDER, JSON.stringify(version));
}
