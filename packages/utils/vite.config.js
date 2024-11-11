// vite.config.js

import { defineConfig } from 'vite';
import { builtinModules } from 'module';

export default defineConfig(({ isSsrBuild }) => {
  if (isSsrBuild) {
    console.log('Building for SSR');

    return {
      build: {
        target: 'esnext',
        ssr: 'src/index.ts',
        ssrManifest: true,
        outDir: 'ssr-build',
        sourcemap: true,
        rollupOptions: {
          input: ['src/index.ts', 'src/openapi.ts'],
          external: ['zod', ...builtinModules],
        },
      },
    };
  }

  return {
    build: {
      target: 'esnext',
      outDir: 'build',
      lib: {
        entry: ['src/index.ts', 'src/openapi.ts'],
        formats: ['es'],
        fileName: (format, entryName) => `${entryName}.${format}.js`,
        types: 'src/index.d.ts',
      },
    },
  };
});
