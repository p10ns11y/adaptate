import { createPartialJsonFeed } from "@adaptate/core/stream-incremental";

import { microsPerChunk, operationsPerSecond } from "./loops.js";

const nowNs = () => Number(process.hrtime.bigint());
const kib = 1024;
const mib = 1024 * 1024;

const cases = [
  { name: "1KiB", bytes: kib, budgetMs: 150, chunkBytes: 256 },
  { name: "32KiB", bytes: 32 * kib, budgetMs: 150, chunkBytes: 4096 },
  { name: "2MiB", bytes: 2 * mib, budgetMs: 200, chunkBytes: 64 * kib },
];

function payloadText(targetBytes) {
  const wrapper = '{"payload":""}';
  const leaf = "a".repeat(Math.max(0, targetBytes - wrapper.length));
  return JSON.stringify({ payload: leaf });
}

function chunksOf(text, size) {
  const chunks = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

function parseOnce(chunks) {
  const feed = createPartialJsonFeed();
  let value;
  for (const chunk of chunks) value = feed(chunk);
  return value;
}

async function hashOnce(bytes) {
  return crypto.subtle.digest("SHA-256", bytes);
}

export async function measureCrossover() {
  const rows = [];
  for (const item of cases) {
    const text = payloadText(item.bytes);
    const encoded = new TextEncoder().encode(text);
    const chunks = chunksOf(text, item.chunkBytes);
    const parsed = parseOnce(chunks);
    if (parsed?.payload !== JSON.parse(text).payload) {
      throw new Error(`${item.name} feed disagreed with JSON.parse`);
    }
    await hashOnce(encoded);

    const parseUs = microsPerChunk(
      () => parseOnce(chunks),
      chunks.length,
      item.budgetMs,
      nowNs,
    );
    const parseOps = operationsPerSecond(
      () => parseOnce(chunks),
      item.budgetMs,
      nowNs,
    );
    const hashWarm = await hashOnce(encoded);
    if (hashWarm.byteLength !== 32) throw new Error(`${item.name} hash length`);
    const hashStart = nowNs();
    let hashPasses = 0;
    const hashStop = hashStart + item.budgetMs * 1e6;
    let hashNow = hashStart;
    while (hashNow < hashStop) {
      await hashOnce(encoded);
      hashPasses += 1;
      hashNow = nowNs();
    }
    const hashSeconds = (hashNow - hashStart) / 1e9;
    const hashPerSec = hashPasses / hashSeconds;
    const megabytes = encoded.byteLength / mib;

    rows.push({
      name: item.name,
      targetBytes: item.bytes,
      payloadBytes: encoded.byteLength,
      chunkBytes: item.chunkBytes,
      chunks: chunks.length,
      parseUsPerChunk: Number(parseUs.toFixed(3)),
      parsePerSec: Number(parseOps.toFixed(3)),
      parseMbPerSec: Number((parseOps * megabytes).toFixed(3)),
      hashPerSec: Number(hashPerSec.toFixed(3)),
      hashMbPerSec: Number((hashPerSec * megabytes).toFixed(3)),
    });
  }
  return {
    runtime: "node",
    runtimeVersion: process.version,
    note: "JS baselines for size-routed accel: parse with createPartialJsonFeed, SHA-256 with Web Crypto. Sizes: ~1 KiB, 32 KiB+, and multi-MB.",
    rows,
  };
}

if (process.argv[1] && process.argv[1].endsWith("crossover.js")) {
  const measured = await measureCrossover();
  process.stdout.write(`${JSON.stringify(measured, null, 2)}\n`);
}
