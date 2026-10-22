import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/', 'public/', 'coverage/', '.wrangler/', 'test-results/', 'playwright-report/']),
  js.configs.recommended,
  tseslint.configs.strict,
  // The rules SonarQube applies to TypeScript, so CI fails on what the Sonar IDE plugin would flag.
  sonarjs.configs.recommended,
  {
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['scripts/**/*.mjs', 'vite.config.ts', 'eslint.config.js', 'playwright.config.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
