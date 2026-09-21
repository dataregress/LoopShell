// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'src-tauri/**', 'contracts/bindings/**', 'tools/**/dist/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Component files also export their hook/helper (Provider + useX, Card +
      // describeX). Fast Refresh falls back to a reload for those files; fine.
      'react-refresh/only-export-components': 'off',
      // TanStack Virtual's hook returns non-memoisable functions; the compiler
      // skips that component on its own. Do not warn about it on every lint.
      'react-hooks/incompatible-library': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Adapter boundary (docs/technology.md §5.2, .cursor/rules/react-ui.mdc):
    // only src/adapters/tauri.ts may import Tauri APIs, and nothing in src/
    // may reach a Loop backend directly.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/adapters/tauri.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tauri-apps/*'],
              message: 'Tauri APIs are only allowed in src/adapters/tauri.ts. Use useAdapter().',
            },
          ],
        },
      ],
    },
  },
  {
    // Components never import fixtures; fixtures are for Storybook, tests and the mock.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/**/*.stories.{ts,tsx}', 'src/adapters/mock.ts', 'src/adapters/tauri.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tauri-apps/*'],
              message: 'Tauri APIs are only allowed in src/adapters/tauri.ts. Use useAdapter().',
            },
            {
              group: ['@contracts/fixtures/*', '**/contracts/fixtures/*'],
              message: 'Fixtures are for tests, stories and the mock only.',
            },
          ],
        },
      ],
    },
  },
);
