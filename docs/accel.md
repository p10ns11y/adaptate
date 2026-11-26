---
title: "Accel"
description: "Optional native, WASM, and GPU packages that speed up large buffers without changing the core install."
answer: "Optional @adaptate/accel packages speed up large buffers. @adaptate/core stays zero-dependency and handles JS objects and buffers under about 32 KiB. Larger work is size-routed to native, then WASM, then JavaScript; GPU is only for multi-MB hash or batch jobs."
faq:
  - question: "Do I need to install accel to use adaptate?"
    answer: "No. adaptate and @adaptate/core work without it. Add @adaptate/accel only when buffers are large enough to benefit."
  - question: "When does GPU run?"
    answer: "Only above a multi-MB threshold, and only for hash or batch work such as the in-memory verification hooks. Smaller work never loads a GPU path."
---

# Accel

Most callers never need this. `@adaptate/core` stays zero-dependency and is the right path for ordinary JS objects and buffers under about 32 KiB.

`@adaptate/accel`, `@adaptate/native`, and `@adaptate/wasm` ship with v3 as optional add-ons alongside `@adaptate/core`.

When a buffer is large, optional packages take over without changing how you call the core APIs. `@adaptate/accel` probes what the runtime can do and size-routes the work.

| Input | Runtime |
| --- | --- |
| JS objects, or buffers under ~32 KiB | Pure JavaScript in `@adaptate/core` |
| Large buffers | `@adaptate/native` (Node-API, CPU SIMD, worker threads), then `@adaptate/wasm` (streaming UTF-8, `wasm32-simd128`), then JavaScript |
| Multi-MB hash or batch work | Optional GPU (WebGPU / wgpu), only above that threshold |

```ts
import { accelerate } from "@adaptate/accel";

const feed = await accelerate({
  native: () => import("@adaptate/native"),
  wasm: () => import("@adaptate/wasm"),
});
```

Install only what you need. A browser can ship `@adaptate/wasm` without the Node-API package. A Node service can use `@adaptate/native` and skip WASM. `@adaptate/core` remains the fallback at every step.

The same router can carry the [#84](https://github.com/p10ns11y/adaptate/issues/84) in-memory hash and verify work. See [Runtime verification](verification.md) and the [v3 feed hook](v3.md).
