---
title: "Acceleration"
description: "Optional native, WASM, and GPU packages for large buffers, kept off the default zero-dep install."
answer: "Optional @adaptate/accel, @adaptate/wasm, and @adaptate/native packages help with large buffers or batched in-memory verification. adaptate and @adaptate/core stay zero-dependency. Skip them for small ~3 µs streaming chunks, where pure JS is already faster."
faq:
  - question: "Do I need to install accel to use adaptate?"
    answer: "No. adaptate and @adaptate/core work without it. Add an acceleration package only when buffers are large enough to benefit, or when you embed the Rust/WASM core in a host."
  - question: "When does acceleration actually help?"
    answer: "On large buffers, multi-MB in-memory verification, batched checks, or a Rust/WASM host embed. Measured SHA-256 at 1 KiB, 32 KiB, and 2 MiB was faster in JS than WASM or native. Small streaming chunks should stay on zero-dep JS."
  - question: "When does GPU run?"
    answer: "Only above a 4 MiB threshold, and only when a hardware GPU is present. A software renderer is ignored, and the work falls back to native, then WASM, then JavaScript."
---

# Acceleration

Skip this for ordinary JS objects, buffers under ~32 KiB, and ~3 µs streaming chunks. `@adaptate/core` stays zero-dependency. `@adaptate/accel`, `@adaptate/native`, and `@adaptate/wasm` are optional Advanced add-ons.

## When it makes sense

| Use it | Leave it out |
| --- | --- |
| Multi-MB in-memory [runtime verification](verification.md) (#84) | Small streaming chunks (~3 µs JS parser) |
| Batched hash or manifest checks | Buffers under ~32 KiB |
| A Rust or WASM host embed of the C ABI core | The default zero-dep install |

## Native, WASM, and GPU

`@adaptate/accel` probes the runtime and size-routes the work. JavaScript is the fallback at every step.

| Path | Package | When it is considered |
| --- | --- | --- |
| JavaScript | `@adaptate/core` / the JS fallback in `@adaptate/accel` | Default. JS objects, buffers under ~32 KiB, and any runtime that has no optional backend. |
| Native | `@adaptate/native` | Node-API (CPU SIMD, worker threads) for large buffers on Node. |
| WASM | `@adaptate/wasm` | A portable C ABI module (`wasm32-simd128`) for browsers or hosts that can instantiate `/adaptate_accel.wasm`. Import `@adaptate/wasm/runtime` in a browser so `node:fs` never enters the bundle. |
| GPU | `@adaptate/native` (`gpu` feature) | Only for hash or batch work at or above 4 MiB, and only when a hardware GPU is present. A software renderer is ignored. |

```ts
import { verifyInMemory } from "@adaptate/accel";

const checked = await verifyInMemory(bytes, {
  sha256: expectedDigest,
});
```

`verifyInMemory` probes `@adaptate/native` and `@adaptate/wasm` when they are installed, then falls back to JavaScript. A browser can ship `@adaptate/wasm` without the Node-API package. A Node service can use `@adaptate/native` and skip WASM.

## Measured numbers

Medians from a real-binary Track 2 run (SHA-256, 7 runs unless noted). JS is `@adaptate/core/verify` / Web Crypto. No number is mocked.

| Work | Size | JS median | Cached WASM median | Native median |
| --- | --- | --- | --- | --- |
| SHA-256 | 1 KiB | 0.003 ms | 0.034 ms | 0.037 ms |
| SHA-256 | 32 KiB | 0.020 ms | 0.101 ms | 0.057 ms |
| SHA-256 | 2 MiB | 1.181 ms | 6.251 ms | 1.688 ms |
| verify | 1 KiB | 0.006 ms | 0.047 ms | 0.039 ms |
| verify | 32 KiB | 0.020 ms | 0.103 ms | 0.057 ms |
| verify | 2 MiB | 1.166 ms | 6.242 ms | 1.740 ms |

| Note | Result |
| --- | --- |
| WASM bindings, cold first hash | 6.394 ms |
| WASM bindings, later cached hash | 0.104 ms |
| Digests | Matched JS on every size above |
| 4 MiB GPU probe | Software renderer only, so GPU stayed unavailable. Native 3.274 ms (3 runs), JS 2.391 ms. Native batch of the same payload: 3.080 ms. |
| UTF-8 scan | `café — こんにちは` and `ä` buffers at 1 KiB, 32 KiB, and 2 MiB: JS, WASM, and native agreed. |

These tables are one host. The [live benchmark](#live-benchmark) on this page runs the same JS vs WASM hash in your browser, with a digest check.

Pair this with [`makeFeed`](v3.md) when the bytes arrive as a stream, and with [runtime verification](verification.md) when a buffer must be checked before anything is stored. Citations: [Proof](proof.md).
