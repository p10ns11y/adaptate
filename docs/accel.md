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

Most callers never need this. `@adaptate/core` stays zero-dependency and is the right path for ordinary JS objects, buffers under about 32 KiB, and streaming chunks around 3 µs, where measured JS is already faster.

`@adaptate/accel`, `@adaptate/native`, and `@adaptate/wasm` are optional Advanced add-ons. They do not change the default install.

## When it makes sense

Use an acceleration package when you have at least one of these:

- Large buffers, especially multi-MB in-memory [runtime verification](verification.md) (#84)
- Batched hash or manifest checks
- A Rust or WASM host embed that wants the C ABI core

Leave them out when you are parsing small streaming chunks. The incremental JS parser already sits around 3 µs per chunk, with no extra install.

## Native, WASM, and GPU

`@adaptate/accel` probes what the runtime can do and size-routes the work. JavaScript remains the fallback at every step.

| Path | Package | When it is considered |
| --- | --- | --- |
| JavaScript | `@adaptate/core` / the JS fallback in `@adaptate/accel` | Default. JS objects, buffers under ~32 KiB, and any runtime that has no optional backend. |
| Native | `@adaptate/native` | Node-API (CPU SIMD, worker threads) for large buffers on Node. |
| WASM | `@adaptate/wasm` | A portable C ABI module (`wasm32-simd128`) for browsers or hosts that can instantiate `/adaptate_accel.wasm`. Import `@adaptate/wasm/runtime` in a browser so `node:fs` never enters the bundle. |
| GPU | `@adaptate/native` (`gpu` feature) | Only for hash or batch work at or above 4 MiB, and only when a hardware GPU is present. A software renderer is ignored. |

```ts
import { verifyInMemory } from "@adaptate/accel";

const checked = await verifyInMemory(bytes, { sha256: expectedDigest });
```

`verifyInMemory` probes `@adaptate/native` and `@adaptate/wasm` when they are installed, then falls back to JavaScript. A browser can ship `@adaptate/wasm` without the Node-API package. A Node service can use `@adaptate/native` and skip WASM.

## Measured numbers

These medians come from a real-binary end-to-end run of the Track 2 fixes (SHA-256, 7 runs unless noted). JS here is the `@adaptate/core/verify` / Web Crypto path. No number in this table is mocked.

| Work | Size | JS median | Cached WASM median | Native median |
| --- | --- | --- | --- | --- |
| SHA-256 | 1 KiB | 0.003 ms | 0.034 ms | 0.037 ms |
| SHA-256 | 32 KiB | 0.020 ms | 0.101 ms | 0.057 ms |
| SHA-256 | 2 MiB | 1.181 ms | 6.251 ms | 1.688 ms |
| verify | 1 KiB | 0.006 ms | 0.047 ms | 0.039 ms |
| verify | 32 KiB | 0.020 ms | 0.103 ms | 0.057 ms |
| verify | 2 MiB | 1.166 ms | 6.242 ms | 1.740 ms |

WASM bindings themselves have a cold cost: a first hash took 6.394 ms, and a later hash on the cached bindings took 0.104 ms. Digests matched JS on every size above.

A 4 MiB in-memory verify was probed for GPU. The host exposed only a software renderer, so the hardware-only probe left GPU unavailable and the work fell back to native (3.274 ms median over 3 runs; JS was 2.391 ms). A native batch of the same payload was 3.080 ms median.

UTF-8 scanning was checked on `café — こんにちは` and on 1 KiB, 32 KiB, and 2 MiB buffers filled with `ä`. JS, WASM, and native all agreed.

The tables above are one host. The [live benchmark](#live-benchmark) on this page runs the same JS vs WASM hash in your browser, with a digest check, so you can see the difference on the machine in front of you.

Pair this with [`makeFeed`](v3.md) when the bytes arrive as a stream, and with [runtime verification](verification.md) when a buffer must be checked before anything is stored. Full citation for the front-page claims stays in [Proof](proof.md).
