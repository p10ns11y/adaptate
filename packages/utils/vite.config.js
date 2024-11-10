// vite.config.js
// import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import { builtinModules } from 'module';

// let yamlLoader = fileURLToPath(new URL('src/load-yaml.ts', import.meta.url));

// import { nodeResolve } from '@rollup/plugin-node-resolve';
// import commonjs from '@rollup/plugin-commonjs';

export default defineConfig({
  // plugins: [
  //   nodeResolve({
  //     // browser: true,
  //     preferBuiltins: true,
  //   }),
  //   commonjs({
  //     preferBuiltins: true,
  //     // browser: true,
  //   }),
  // ],
  // plugins: [
  //   nodeResolve({
  //     preferBuiltins: true,
  //     browser: false,
  //   }),
  //   commonjs(),
  // ],
  // resolve: {
  //   preferBuiltins: true,
  //   browser: false,
  // },
  build: {
    target: 'esnext',
    ssr: true,
    outDir: 'build',
    // minify: false,
    lib: {
      entry: ['src/index.ts', 'src/openapi.ts'],
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.${format}.js`,
      types: 'src/index.d.ts',
    },
    rollupOptions: {
      external: ['zod', ...builtinModules],
    },
  },
  // external: [/load\-yaml/],
  // optimizeDeps: {
  //   include: ['@apidevtools/swagger-parser', 'js-yaml'],
  // },
});
