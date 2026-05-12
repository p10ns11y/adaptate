import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'json', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['packages/**/*.ts'],
      exclude: [
        'node_modules',
        'build',
        'test',
        'packages/**/*.test.ts',
        // export only no source code
        'packages/utils/src/index.ts',
      ],
      thresholds: {
        lines: 100,
        statements: 100,
        branches: 100,
        functions: 100,
      },
    },
  },
});
