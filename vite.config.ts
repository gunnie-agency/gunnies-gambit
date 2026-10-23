/// <reference types="vitest/config" />
import { Chess } from 'chess.js';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import {
  faqHtml,
  howToPlayStructuredData,
  indexNowKeyFile,
  jsonLdScript,
  llmsTxt,
  robotsTxt,
  shortName,
  sitemapXml,
  structuredData,
  webManifest,
  type Site,
} from './src/site/files.ts';
import { boardHtml } from './src/board/board.ts';
import { DEFAULT_LEVEL_ID, LEVELS } from './src/engine/levels.ts';
import { escapeHtml } from './src/util/html.ts';
import { footerHtml, logoSymbol } from './src/site/partials.ts';
import { cacheVersion, fillServiceWorker, precacheEntries } from './src/sw/precache.ts';

const stockfish = JSON.parse(readFileSync('node_modules/stockfish/package.json', 'utf8')) as { version: string };

/**
 * Adds the Cloudflare Web Analytics beacon to production builds only, so development visits are not counted.
 * It sets no cookies and collects no personal data; see the privacy note in the README.
 */
function cloudflareAnalytics(token: string | undefined): Plugin {
  return {
    name: 'cloudflare-web-analytics',
    apply: 'build',
    transformIndexHtml() {
      if (!token) return [];
      return [
        {
          tag: 'script',
          attrs: {
            defer: true,
            src: 'https://static.cloudflareinsights.com/beacon.min.js',
            'data-cf-beacon': JSON.stringify({ token }),
          },
          injectTo: 'body',
        },
      ];
    },
  };
}

/**
 * Preloads the body font (Instrument Sans, Latin subset), so it usually arrives before the first paint instead of
 * replacing the fallback afterwards. Build only: the file name carries Vite's content hash.
 */
function preloadBodyFont(): Plugin {
  return {
    name: 'preload-body-font',
    apply: 'build',
    transformIndexHtml(_html, ctx) {
      const font = Object.keys(ctx.bundle ?? {}).find((name) =>
        /instrument-sans-latin-wght-normal-[\w-]+\.woff2$/.test(name),
      );
      if (!font) throw new Error('preload-body-font: Instrument Sans Latin woff2 not found in the bundle');
      return [
        {
          tag: 'link',
          attrs: { rel: 'preload', href: `./${font}`, as: 'font', type: 'font/woff2', crossorigin: true },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

/**
 * Fails the build when a font ends up base64-inlined in a stylesheet. Vite inlines assets under 4 KB, which for font
 * subsets means bytes in the render-blocking CSS for scripts the site never shows; src/fonts.ts imports only the
 * Latin files, and this keeps it that way.
 */
function noInlinedFonts(): Plugin {
  return {
    name: 'no-inlined-fonts',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && file.fileName.endsWith('.css') && String(file.source).includes('data:font')) {
          this.error(`${file.fileName} inlines a font as data: URL; import a larger subset or a single file instead`);
        }
      }
    },
  };
}

/**
 * Runs before first paint: applies a stored light theme, so the page does not flash dark (key as in src/ui/chrome.ts),
 * and marks a stored "evaluation shown" (analysis mode or the play-mode setting, see src/state.ts), so on phones the
 * eval bar's space is reserved from the start rather than pushing the board aside when the app script runs. It also
 * marks a stored Analyse mode, so the settings and hint text that differ per mode are right on first paint; a
 * practice link (`#…mode=play…`, src/util/link.ts) opens in Play with a new game whatever was stored. Otherwise it
 * puts the saved game's number of move-list rows in --saved-rows, so the move list has their room before the app
 * fills it. When storage is blocked or unreadable the defaults apply: dark theme, no evaluation, an empty move list.
 * Inline in each page's head rather than a file, so it costs no request; the CSP allows exactly this text by its hash.
 */
const THEME_INIT =
  'try{const root=document.documentElement;' +
  "if(localStorage.getItem('gunnies-gambit.theme')==='light')root.dataset.theme='light';" +
  "const saved=JSON.parse(localStorage.getItem('gunnies-gambit.v2')??'null');" +
  'const practice=/[#&]mode=play(&|$)/.test(location.hash);' +
  "if(saved?.mode==='analysis'&&!practice)root.dataset.mode='analysis';" +
  "if(root.dataset.mode||saved?.showEval===true)root.dataset.evalbar='on';" +
  "if(Array.isArray(saved?.moves)&&!practice)root.style.setProperty('--saved-rows',String(Math.ceil(saved.moves.length/2)))" +
  '}catch{}';
const THEME_INIT_HASH_PLACEHOLDER = '%THEME_INIT_SHA256%';

/**
 * Puts the theme script first in each page's head, and its SHA-256 into the CSP of the built `_headers` in place of
 * %THEME_INIT_SHA256%. The hash is worked out from the script itself, so the two cannot drift apart.
 */
function themeInit(): Plugin {
  let outDir = '';
  return {
    name: 'theme-init',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml() {
      return [{ tag: 'script', children: THEME_INIT, injectTo: 'head-prepend' }];
    },
    writeBundle() {
      const file = join(outDir, '_headers');
      const headers = readFileSync(file, 'utf8');
      if (!headers.includes(THEME_INIT_HASH_PLACEHOLDER)) {
        this.error(`theme-init: ${THEME_INIT_HASH_PLACEHOLDER} missing from public/_headers`);
      }
      const hash = createHash('sha256').update(THEME_INIT).digest('base64');
      writeFileSync(file, headers.replaceAll(THEME_INIT_HASH_PLACEHOLDER, hash));
    },
  };
}

/** The commit date of HEAD, so the sitemap's lastmod only moves when the site changes. */
function lastCommitDate(): string | undefined {
  try {
    // Build time only: the developer's or CI's own git, the same one that checked the code out.
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    return execFileSync('git', ['log', '-1', '--format=%cs'], { encoding: 'utf8' }).trim() || undefined;
  } catch {
    return undefined;
  }
}

const FAQ_PLACEHOLDER = '<!-- %FAQ% -->';
const LOGO_PLACEHOLDER = '<!-- %LOGO_SYMBOL% -->';
const FOOTER_PLACEHOLDER = '<!-- %FOOTER% -->';
const BOARD_PLACEHOLDER = '<!-- %BOARD% -->';
const LEVELS_PLACEHOLDER = '<!-- %LEVEL_OPTIONS% -->';

/** The opponent select's options, so it has its final width before the script runs. */
function levelOptions(): string {
  return LEVELS.map(
    (l) => `<option value="${l.id}"${l.id === DEFAULT_LEVEL_ID ? ' selected' : ''}>${escapeHtml(l.label)}</option>`,
  ).join('');
}

/** The HTML pages, by file name. */
const PAGES = { 'index.html': 'index', 'how-to-play.html': 'howToPlay' } as const;

/** Puts a page's placeholder in place, and fails the build when the page lost it. */
function fill(html: string, placeholder: string, markup: string, page: string): string {
  if (!html.includes(placeholder)) throw new Error(`site-files: ${placeholder} missing from ${page}`);
  return html.replace(placeholder, markup);
}

/**
 * Fills in %APP_SHORT_NAME% (the header's accent word, so the header has its final size at first paint), the shared
 * logo symbol and footer, and the FAQ, the start position and the opponent levels on the home page (so the pieces
 * show and the settings have their size before the script runs); adds each page's structured data to its head; and generates
 * robots.txt, sitemap.xml, the web app manifest, llms.txt and the IndexNow key file from `.env` (see
 * src/site/files.ts). The files are emitted into the build and served by the dev server.
 */
function siteFiles(site: Site, indexNowKey: string | undefined): Plugin {
  const files: Record<string, { type: string; body: string }> = {
    'robots.txt': { type: 'text/plain', body: robotsTxt(site) },
    'sitemap.xml': { type: 'application/xml', body: sitemapXml(site) },
    'manifest.webmanifest': { type: 'application/manifest+json', body: webManifest(site) },
    'llms.txt': { type: 'text/plain', body: llmsTxt(site) },
  };
  if (indexNowKey) {
    const { fileName, body } = indexNowKeyFile(indexNowKey);
    files[fileName] = { type: 'text/plain', body };
  }
  return {
    name: 'site-files',
    transformIndexHtml(html, ctx) {
      const page = basename(ctx.filename);
      if (!(page in PAGES)) throw new Error(`site-files: unknown page ${page}; add it to PAGES`);
      let out = html.replaceAll('%APP_SHORT_NAME%', shortName(site.name));
      out = fill(out, LOGO_PLACEHOLDER, logoSymbol(), page);
      out = fill(out, FOOTER_PLACEHOLDER, footerHtml(site.name), page);
      const isHome = PAGES[page as keyof typeof PAGES] === 'index';
      if (isHome) {
        out = fill(out, FAQ_PLACEHOLDER, faqHtml(site), page);
        out = fill(out, BOARD_PLACEHOLDER, boardHtml({ game: new Chess(), orient: 'w', selected: null }), page);
        out = fill(out, LEVELS_PLACEHOLDER, levelOptions(), page);
      }
      const data = isHome ? structuredData(site) : howToPlayStructuredData(site);
      return {
        html: out,
        tags: [
          { tag: 'script', attrs: { type: 'application/ld+json' }, children: jsonLdScript(data), injectTo: 'head' },
        ],
      };
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = files[(req.url ?? '').split('?')[0]?.slice(1) ?? ''];
        if (!file) return next();
        res.setHeader('Content-Type', `${file.type}; charset=utf-8`);
        res.end(file.body);
      });
    },
    generateBundle() {
      for (const [fileName, { body }] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName, source: body });
      }
    },
  };
}

/** Every file under a directory, as paths relative to it with forward slashes. */
function filesIn(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => statSync(join(dir, name)).isFile())
    .map((name) => relative(dir, join(dir, name)).split(sep).join('/'));
}

const SERVICE_WORKER = 'sw.js';

/**
 * Builds the offline service worker (src/sw/sw.ts) to /sw.js, with the list of files to precache and a cache version
 * filled in from the finished bundle plus the copied public files (see src/sw/precache.ts). Runs after the other
 * plugins, so the pages it hashes are the final HTML.
 */
function serviceWorker(): Plugin {
  let publicDir = '';
  return {
    name: 'service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const worker = bundle[SERVICE_WORKER];
      if (worker?.type !== 'chunk') return this.error(`service-worker: ${SERVICE_WORKER} missing from the bundle`);
      const contents = new Map<string, string | Uint8Array>();
      for (const name of filesIn(publicDir)) contents.set(name, readFileSync(join(publicDir, name)));
      for (const file of Object.values(bundle)) {
        if (file !== worker) contents.set(file.fileName, file.type === 'chunk' ? file.code : file.source);
      }
      const entries = precacheEntries([...contents.keys()]).map(({ file, url }) => ({
        url,
        content: contents.get(file) ?? '',
      }));
      const urls = entries.map((entry) => entry.url);
      worker.code = fillServiceWorker(worker.code, urls, cacheVersion(entries));
    },
  };
}

export default defineConfig(({ mode }) => {
  // The '' prefix also loads INDEXNOW_KEY, which only the build needs.
  const env = loadEnv(mode, process.cwd(), '');
  const site: Site = {
    name: env.VITE_APP_NAME ?? '',
    url: env.VITE_SITE_URL ?? '',
    stockfishVersion: stockfish.version,
    lastmod: lastCommitDate(),
  };
  return {
    // Relative base so the build also works from a sub-path (GitHub Pages).
    base: './',
    define: {
      __STOCKFISH_FILE__: JSON.stringify(`stockfish/stockfish-${stockfish.version}-lite-single.js`),
    },
    plugins: [
      siteFiles(site, env.INDEXNOW_KEY),
      themeInit(),
      preloadBodyFont(),
      noInlinedFonts(),
      cloudflareAnalytics(env.VITE_CF_ANALYTICS_TOKEN),
      serviceWorker(),
    ],
    build: {
      rollupOptions: {
        input: {
          ...Object.fromEntries(
            Object.entries(PAGES).map(([file, name]) => [name, resolve(import.meta.dirname, file)]),
          ),
          sw: resolve(import.meta.dirname, 'src/sw/sw.ts'),
        },
        // The service worker keeps a fixed name at the root: its URL is its identity, and its scope is its directory.
        output: {
          entryFileNames: (chunk) => (chunk.name === 'sw' ? SERVICE_WORKER : 'assets/[name]-[hash].js'),
        },
      },
    },
    test: {
      include: ['src/**/*.test.ts'],
    },
  };
});
