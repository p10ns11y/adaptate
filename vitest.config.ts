import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'json', 'html', 'json-summary'],
      include: ['packages/**/*.ts'],
      exclude: [
        'node_modules',
        'build',
        'test',
        'packages/**/*.test.ts',
        // export only no source code
        'packages/utils/src/index.ts',
      ],
    },
  },
});
