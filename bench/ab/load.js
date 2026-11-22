import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function libraryHref(root, specifier) {
  if (!root) return specifier;
  if (specifier === "zod") {
    const candidates = [
      resolve(root, "packages/core/node_modules/zod/index.js"),
      resolve(root, "node_modules/zod/index.js"),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) return pathToFileURL(candidate).href;
    }
    throw new Error(`zod not found under ${root}`);
  }
  const entry =
    specifier === "@adaptate/core" ? "index" : specifier.split("/").at(-1);
  const file = resolve(root, "packages/core/build", `${entry}.es.js`);
  if (!existsSync(file)) throw new Error(`missing build ${file}`);
  return pathToFileURL(file).href;
}

export async function adaptateStreamForBench(root) {
  const stream = await import(libraryHref(root, "@adaptate/core/stream"));
  const incrementalFile = root
    ? resolve(root, "packages/core/build/stream-incremental.es.js")
    : "";
  if (root && !existsSync(incrementalFile)) return stream;
  const incremental = await import(
    root
      ? pathToFileURL(incrementalFile).href
      : "@adaptate/core/stream-incremental",
  );
  return {
    ...stream,
    createAgUiPartialValidator: incremental.createAgUiPartialValidator,
  };
}
