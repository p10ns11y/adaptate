// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: 'build',
    sourcemap: true,
    lib: {
      entry: ['src/index.ts', 'src/stream.ts', 'src/stream-incremental.ts', 'src/standard.ts', 'src/effect.ts', 'src/result.ts', 'src/verify.ts'],
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.${format}.js`,
    },
    rollupOptions: {
      external: ['zod', 'effect'],
    },
  },
});
