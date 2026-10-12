/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';

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

export default defineConfig(({ mode }) => ({
  // Relative base so the build also works from a sub-path (GitHub Pages).
  base: './',
  define: {
    __STOCKFISH_FILE__: JSON.stringify(`stockfish/stockfish-${stockfish.version}-lite-single.js`),
  },
  plugins: [cloudflareAnalytics(loadEnv(mode, process.cwd()).VITE_CF_ANALYTICS_TOKEN)],
  test: {
    include: ['src/**/*.test.ts'],
  },
}));
