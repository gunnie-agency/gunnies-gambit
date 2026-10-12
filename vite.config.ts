/// <reference types="vitest/config" />
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { llmsTxt, robotsTxt, sitemapXml, structuredDataScript, webManifest, type Site } from './src/site/files.ts';

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

/** The commit date of HEAD, so the sitemap's lastmod only moves when the site changes. */
function lastCommitDate(): string | undefined {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs'], { encoding: 'utf8' }).trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Adds the structured data to the page head and generates robots.txt, sitemap.xml, the web app manifest and llms.txt
 * from `.env` (see src/site/files.ts). The files are emitted into the build and served by the dev server.
 */
function siteFiles(site: Site): Plugin {
  const files: Record<string, { type: string; body: string }> = {
    'robots.txt': { type: 'text/plain', body: robotsTxt(site) },
    'sitemap.xml': { type: 'application/xml', body: sitemapXml(site) },
    'manifest.webmanifest': { type: 'application/manifest+json', body: webManifest(site) },
    'llms.txt': { type: 'text/plain', body: llmsTxt(site) },
  };
  return {
    name: 'site-files',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          children: structuredDataScript(site),
          injectTo: 'head',
        },
      ];
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
  const env = loadEnv(mode, process.cwd());
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
    plugins: [siteFiles(site), cloudflareAnalytics(env.VITE_CF_ANALYTICS_TOKEN)],
    test: {
      include: ['src/**/*.test.ts'],
    },
  };
});
