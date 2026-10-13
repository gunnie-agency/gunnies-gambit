/// <reference types="vitest/config" />
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import {
  faqHtml,
  indexNowKeyFile,
  llmsTxt,
  robotsTxt,
  shortName,
  sitemapXml,
  structuredDataScript,
  webManifest,
  type Site,
} from './src/site/files.ts';

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

/**
 * Fills in %APP_SHORT_NAME% (the header's accent word, so the header has its final size at first paint) and the FAQ,
 * adds the structured data to the page head and generates robots.txt, sitemap.xml, the web app manifest, llms.txt
 * and the IndexNow key file from `.env` (see src/site/files.ts). The files are emitted into the build and served by
 * the dev server.
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
    transformIndexHtml(html) {
      if (!html.includes(FAQ_PLACEHOLDER)) throw new Error(`site-files: ${FAQ_PLACEHOLDER} missing from index.html`);
      return {
        html: html.replaceAll('%APP_SHORT_NAME%', shortName(site.name)).replace(FAQ_PLACEHOLDER, faqHtml(site)),
        tags: [
          {
            tag: 'script',
            attrs: { type: 'application/ld+json' },
            children: structuredDataScript(site),
            injectTo: 'head',
          },
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
    plugins: [siteFiles(site, env.INDEXNOW_KEY), preloadBodyFont(), cloudflareAnalytics(env.VITE_CF_ANALYTICS_TOKEN)],
    test: {
      include: ['src/**/*.test.ts'],
    },
  };
});
