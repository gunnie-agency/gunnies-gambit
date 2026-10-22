import { describe, expect, it } from 'vitest';
import { cacheVersion, fillServiceWorker, precacheEntries } from './precache';

const BUILD = [
  '404.html',
  '_headers',
  'apple-touch-icon.png',
  'assets/index-AbC123.js',
  'assets/index-AbC123.js.map',
  'assets/chrome-XyZ789.css',
  'assets/instrument-sans-latin-wght-normal-BbzFLZTg.woff2',
  'assets/jetbrains-mono-latin-400-normal-6-qcROiO.woff',
  'b2e14306057b13d62d5aebdd230864b1.txt',
  'favicon.ico',
  'favicon.svg',
  'how-to-play.html',
  'icon-192.png',
  'icon-maskable-512.png',
  'index.html',
  'llms.txt',
  'manifest.webmanifest',
  'og.png',
  'pieces/cburnett/wK.svg',
  'robots.txt',
  'sitemap.xml',
  'stockfish/COPYING.txt',
  'stockfish/stockfish-19.0.1-lite-single.js',
  'stockfish/stockfish-19.0.1-lite-single.wasm',
];

describe('precacheEntries', () => {
  it('keeps what the app needs offline, in a stable order', () => {
    expect(precacheEntries(BUILD).map((entry) => entry.file)).toEqual([
      'apple-touch-icon.png',
      'assets/chrome-XyZ789.css',
      'assets/index-AbC123.js',
      'assets/instrument-sans-latin-wght-normal-BbzFLZTg.woff2',
      'favicon.ico',
      'favicon.svg',
      'how-to-play.html',
      'icon-192.png',
      'icon-maskable-512.png',
      'index.html',
      'manifest.webmanifest',
      'pieces/cburnett/wK.svg',
      'stockfish/COPYING.txt',
      'stockfish/stockfish-19.0.1-lite-single.js',
      'stockfish/stockfish-19.0.1-lite-single.wasm',
    ]);
  });

  it('stores the pages under the URLs they are served at', () => {
    const urls = Object.fromEntries(precacheEntries(BUILD).map(({ file, url }) => [file, url]));
    expect(urls['index.html']).toBe('./');
    expect(urls['how-to-play.html']).toBe('how-to-play');
    expect(urls['assets/index-AbC123.js']).toBe('assets/index-AbC123.js');
  });

  it('leaves out the 404 page, crawler files, the social card, WOFF fallbacks and source maps', () => {
    const files = new Set(precacheEntries(BUILD).map((entry) => entry.file));
    for (const file of ['404.html', 'robots.txt', 'og.png', '_headers', 'assets/index-AbC123.js.map'])
      expect(files.has(file)).toBe(false);
    expect([...files].some((file) => file.endsWith('.woff'))).toBe(false);
  });

  it('does not take HTML from subdirectories as pages', () => {
    expect(precacheEntries(['docs/page.html'])).toEqual([]);
  });
});

describe('cacheVersion', () => {
  const engine = { url: 'stockfish/engine.wasm', content: new Uint8Array([0, 97, 115, 109]) };
  const entries = [{ url: './', content: '<html>' }, engine];

  it('is a short hex hash that only depends on the URLs and contents', () => {
    expect(cacheVersion(entries)).toMatch(/^[0-9a-f]{12}$/);
    expect(cacheVersion(entries)).toBe(cacheVersion([...entries]));
  });

  it('changes when a file changes or moves', () => {
    const base = cacheVersion(entries);
    expect(cacheVersion([{ url: './', content: '<html lang="en">' }, engine])).not.toBe(base);
    expect(cacheVersion([{ url: 'home', content: '<html>' }, engine])).not.toBe(base);
  });
});

describe('fillServiceWorker', () => {
  it('puts the list and the version in place', () => {
    const code = 'const c=`x-${__SW_VERSION__}`;cache.addAll(__SW_PRECACHE__)';
    expect(fillServiceWorker(code, ['./', 'a.js'], 'abc')).toBe('const c=`x-${"abc"}`;cache.addAll(["./","a.js"])');
  });

  it('fails when the built worker lost a placeholder', () => {
    expect(() => fillServiceWorker('cache.addAll(__SW_PRECACHE__)', [], 'abc')).toThrow(/__SW_VERSION__/);
  });
});
