import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * Deprecation-only ESLint: `@typescript-eslint/no-deprecated` (type-aware).
 * General linting uses Oxlint (see `.oxlintrc.json`).
 *
 * Uses ESLint `defineConfig()` (not deprecated `tseslint.config()`).
 */
export default defineConfig(
  {
    ignores: [
      '**/build/**',
      '**/ssr-build/**',
      '**/coverage/**',
      '**/node_modules/**',
    ],
  },
  tseslint.configs.base,
  {
    files: ['**/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-deprecated': 'error',
    },
  }
);
