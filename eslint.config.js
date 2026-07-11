// Flat config. Strict TS + React hooks + Vite HMR compatibility.
// No formatting rules — Prettier owns formatting. ESLint owns correctness.

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // React Compiler-prep rules (v7 additions) are too aggressive for our
      // stable-callback-via-ref pattern and event-handler uses of Date.now.
      // Re-evaluate if/when we adopt the React Compiler.
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      // Warn (with --max-warnings=0 this is enforced). Where we intentionally
      // track granular position fields (lat/lng) instead of the whole `self`
      // object, annotate the site with eslint-disable-next-line + a reason.
      // This rule being off repo-wide is how the hazard-watch stale-deps bug
      // shipped (2026-07 audit).
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.config.{js,ts,mjs}', 'scripts/**'],
    rules: { 'no-console': 'off' },
  },
);
