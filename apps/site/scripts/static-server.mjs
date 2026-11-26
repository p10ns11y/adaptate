import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

let types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
};

let vercelConfig = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

export let isolationHeaders = Object.fromEntries(
  vercelConfig.headers.flatMap((rule) => rule.headers.map((header) => [header.key, header.value])),
);

export function startStaticServer(root) {
  let server = createServer((request, response) => {
    let pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    let path = normalize(join(root, pathname));
    if (!path.startsWith(root)) {
      response.writeHead(403).end();
      return;
    }
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");
    if (!existsSync(path)) {
      response.writeHead(404, isolationHeaders).end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream", ...isolationHeaders });
    response.end(readFileSync(path));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      let address = server.address();
      let port = typeof address === "object" && address ? address.port : 0;
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done(undefined))),
      });
    });
  });
}
