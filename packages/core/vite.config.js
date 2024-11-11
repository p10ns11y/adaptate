// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: 'build',
    sourcemap: true,
    lib: {
      entry: ['src/index.ts'],
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.${format}.js`,
      types: 'src/index.d.ts',
    },
    rollupOptions: {
      external: ['zod'],
    },
  },
});
