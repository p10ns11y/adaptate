import * as esbuild from "esbuild";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const benchDir = dirname(fileURLToPath(import.meta.url));

const entries = [
  {
    id: "zod-only",
    file: "zod-only.js",
    importsZod: true,
    importsEffect: false,
    adaptate: false,
  },
  {
    id: ".",
    file: "core.js",
    importsZod: true,
    importsEffect: false,
    adaptate: true,
  },
  {
    id: "./stream",
    file: "stream.js",
    importsZod: true,
    importsEffect: false,
    adaptate: true,
  },
  {
    id: "./standard",
    file: "standard.js",
    importsZod: false,
    importsEffect: false,
    adaptate: true,
  },
  {
    id: "./stream-incremental",
    file: "stream-incremental.js",
    importsZod: true,
    importsEffect: false,
    adaptate: true,
  },
  {
    id: "./effect",
    file: "effect.js",
    importsZod: true,
    importsEffect: true,
    adaptate: true,
  },
];

function bundledPackage(inputs, name) {
  return inputs.some(
    (input) =>
      input.includes(`/node_modules/${name}/`) ||
      input.includes(`node_modules/${name}/`),
  );
}

function aliasFor(root) {
  const build = resolve(root, "packages/core/build");
  return {
    "@adaptate/core/stream": resolve(build, "stream.es.js"),
    "@adaptate/core/stream-incremental": resolve(build, "stream-incremental.es.js"),
    "@adaptate/core/standard": resolve(build, "standard.es.js"),
    "@adaptate/core/effect": resolve(build, "effect.es.js"),
    "@adaptate/core": resolve(build, "index.es.js"),
  };
}

async function bundleFile(file, root, external) {
  const result = await esbuild.build({
    absWorkingDir: benchDir,
    entryPoints: [resolve(benchDir, "entries", file)],
    bundle: true,
    minify: true,
    format: "esm",
    platform: "neutral",
    target: "esnext",
    write: false,
    treeShaking: true,
    metafile: true,
    legalComments: "none",
    external,
    alias: aliasFor(root),
  });
  if (result.outputFiles.length !== 1) {
    throw new Error(`${file} produced ${result.outputFiles.length} outputs`);
  }
  const contents = result.outputFiles[0].contents;
  return {
    contents,
    inputs: Object.keys(result.metafile.inputs),
    minBytes: contents.byteLength,
    gzipBytes: gzipSync(contents, { level: 9 }).byteLength,
  };
}

function assertShape(entry, built, external) {
  const zodExternal = external.includes("zod");
  const includesBuild = built.inputs.some((input) =>
    input.includes("packages/core/build"),
  );
  if (bundledPackage(built.inputs, "effect")) {
    throw new Error(`${entry.id} bundled the effect package`);
  }
  if (!entry.importsZod && bundledPackage(built.inputs, "zod")) {
    throw new Error(`${entry.id} bundled zod`);
  }
  if (entry.importsZod && !zodExternal && !bundledPackage(built.inputs, "zod")) {
    throw new Error(`${entry.id} did not bundle zod`);
  }
  if (entry.adaptate && !includesBuild) {
    throw new Error(
      `${entry.id} did not include packages/core/build: ${built.inputs.join(", ")}`,
    );
  }
  if (!entry.adaptate && includesBuild) {
    throw new Error("zod-only bundled adaptate");
  }
  if (entry.importsEffect) {
    const source = Buffer.from(built.contents).toString("utf8");
    if (!source.includes("effect")) {
      throw new Error("effect entry dropped the effect import");
    }
  }
}

export async function measureBundles(root, smokeLabel) {
  const measured = [];
  for (const entry of entries) {
    if (
      entry.id === "./stream-incremental" &&
      !existsSync(resolve(root, "packages/core/build/stream-incremental.es.js"))
    ) {
      continue;
    }
    const fullExternal = entry.importsEffect ? ["effect"] : [];
    const ownExternal = ["zod", "effect"];
    const full = await bundleFile(entry.file, root, fullExternal);
    assertShape(entry, full, fullExternal);
    const own = entry.importsZod
      ? await bundleFile(entry.file, root, ownExternal)
      : full;
    if (entry.importsZod) assertShape(entry, own, ownExternal);
    if (smokeLabel && entry.id !== "./effect") {
      const smokeDir = resolve(benchDir, "results", "smoke", smokeLabel);
      mkdirSync(smokeDir, { recursive: true });
      const smokeFile = resolve(
        smokeDir,
        `${entry.file.replace(".js", "")}.js`,
      );
      writeFileSync(smokeFile, full.contents);
      const loaded = await import(pathToFileURL(smokeFile).href);
      if (loaded.ready !== true) {
        throw new Error(`${entry.id} bundle ready was ${String(loaded.ready)}`);
      }
    }
    measured.push({
      id: entry.id,
      includesZod: entry.importsZod,
      effectExternal: entry.importsEffect,
      full: { minBytes: full.minBytes, gzipBytes: full.gzipBytes },
      own: { minBytes: own.minBytes, gzipBytes: own.gzipBytes },
    });
  }
  const zodOnly = measured.find((entry) => entry.id === "zod-only");
  return {
    tool: "esbuild",
    esbuildVersion: esbuild.version,
    legalComments: "none",
    gzipLevel: 9,
    zodOnly: zodOnly.full,
    entries: measured.filter((entry) => entry.id !== "zod-only"),
  };
}

export async function writeBrowserBundles(root) {
  const outDir = resolve(benchDir, "results", "browser");
  mkdirSync(outDir, { recursive: true });
  const files = ["browser-zod.js", "browser-adaptate.js", "browser-valibot.js"];
  for (const file of files) {
    const result = await esbuild.build({
      absWorkingDir: benchDir,
      entryPoints: [resolve(benchDir, "entries", file)],
      bundle: true,
      minify: true,
      format: "esm",
      platform: "neutral",
      target: "esnext",
      outfile: resolve(outDir, file),
      treeShaking: true,
      legalComments: "none",
      alias: aliasFor(root),
    });
    if (result.errors?.length) {
      throw new Error(result.errors.map((error) => error.text).join("\n"));
    }
  }
  return outDir;
}
