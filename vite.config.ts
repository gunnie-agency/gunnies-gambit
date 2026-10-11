/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const stockfish = JSON.parse(readFileSync('node_modules/stockfish/package.json', 'utf8')) as { version: string };

export default defineConfig({
  // Relative base so the build also works from a sub-path (GitHub Pages).
  base: './',
  define: {
    __STOCKFISH_FILE__: JSON.stringify(`stockfish/stockfish-${stockfish.version}-lite-single.js`),
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
