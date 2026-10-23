/// <reference lib="webworker" />
import { CACHE_PREFIX, NOT_FOUND_PAGE, canonicalUrl, isCacheable, pageKey, staleCaches, strategyFor } from './policy';

/**
 * The service worker that keeps the app working offline, built to /sw.js. The build replaces the two constants below
 * with the precache list and the cache version (see src/sw/precache.ts and the service-worker plugin).
 *
 * A new version does not skip waiting: it takes over once every tab of the old one is closed. Taking over a running
 * page would delete the cache it still relies on, so a review opened later in that tab could not load an engine file
 * the deploy replaced. Pages come from the network first anyway, so online visitors see a deploy at once.
 *
 * Once active, it does claim the pages it does not control yet: on a first visit that is the page that installed it,
 * which then gets its lazily loaded files (the openings book) from this build's cache even after a deploy removed
 * them from the server. Such a page has no cache of ours to lose, and a file missing from this cache still comes from
 * the network, so it can only gain from being claimed. A page an older version controls is never claimed, because
 * this version only activates once there are none.
 */
declare const self: ServiceWorkerGlobalScope;
declare const __SW_PRECACHE__: readonly string[];
declare const __SW_VERSION__: string;

const CACHE = `${CACHE_PREFIX}${__SW_VERSION__}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(__SW_PRECACHE__)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(staleCaches(names, CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const strategy = strategyFor(request, self.location.origin);
  if (strategy === 'network-first') event.respondWith(networkFirst(event, request));
  else if (strategy === 'cache-first') event.respondWith(cacheFirst(event, request));
});

function store(event: FetchEvent, key: RequestInfo, response: Response): void {
  if (!isCacheable(response)) return;
  const copy = response.clone();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.put(key, copy)));
}

async function networkFirst(event: FetchEvent, request: Request): Promise<Response> {
  const { scope } = self.registration;
  const key = pageKey(request.url, scope);
  try {
    const response = await fetch(request);
    store(event, key, response);
    return response;
  } catch (err) {
    const cached = await caches.match(key, { cacheName: CACHE });
    if (cached) return answerFor(request, key, cached);
    // Offline, an address we do not know gets the 404 page, with the status the server would have given it.
    const notFound = await caches.match(new URL(NOT_FOUND_PAGE, scope).href, { cacheName: CACHE });
    if (notFound)
      return new Response(notFound.body, { status: 404, statusText: 'Not Found', headers: notFound.headers });
    throw err;
  }
}

/**
 * Another spelling of a page is sent on to the page's own address, as the server does online: served in place,
 * `how-to-play/` would resolve the page's relative links one directory too deep.
 */
function answerFor(request: Request, key: string, cached: Response): Response {
  const canonical = canonicalUrl(request.url, key);
  return canonical === request.url ? cached : Response.redirect(canonical, 307);
}

async function cacheFirst(event: FetchEvent, request: Request): Promise<Response> {
  // Scripts, styles and fonts are fetched in CORS mode, so they carry an Origin header the precache requests did
  // not; a server's `Vary: Origin` would then hide every cached copy.
  const cached = await caches.match(request, { cacheName: CACHE, ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  store(event, request, response);
  return response;
}
