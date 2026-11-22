import { buildLoadScript, defaultRunMs } from "./load-script";

let script = buildLoadScript();
let startedAt = performance.now();
let cursor = 0;
let burstLimit = 8;

function pump(): void {
  let elapsed = performance.now() - startedAt;
  let sent = 0;
  while (cursor < script.length && sent < burstLimit) {
    let chunk = script[cursor];
    if (!chunk || chunk.atMs > elapsed) break;
    postMessage({ kind: "chunk", ...chunk });
    cursor += 1;
    sent += 1;
  }
  if (sent === burstLimit && cursor < script.length) {
    setTimeout(pump, 0);
    return;
  }
  if (elapsed >= defaultRunMs && cursor >= script.length) {
    postMessage({ kind: "done" });
    return;
  }
  setTimeout(pump, 16);
}

pump();
