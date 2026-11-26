import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "esnext",
    outDir: "build",
    sourcemap: true,
    lib: {
      entry: ["src/index.ts", "src/runtime.ts"],
      formats: ["es"],
      fileName: (format, entryName) => `${entryName}.${format}.js`,
    },
    rollupOptions: {
      external: ["node:fs", "node:module", "node:path", "node:url"],
    },
  },
});
