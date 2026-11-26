---
title: "Migration 3.0"
description: "v3 is additive: makeFeed, @adaptate/core/verify, and optional acceleration packages, with the default install still zero-dep."
answer: "v3 is additive for 2.4 callers. makeFeed is optional on fromAsyncIterableSteps and parseStream, @adaptate/core/verify is a new subpath, and the acceleration packages are optional Advanced installs. adaptate and @adaptate/core stay zero-dependency aside from the zod peer."
faq:
  - question: "Do I need to change code to upgrade?"
    answer: "No. Existing imports and the default feed stay the same. Adopt makeFeed, @adaptate/core/verify, or an acceleration package only when you need them."
  - question: "Does the default install gain dependencies?"
    answer: "No. adaptate and @adaptate/core still have no runtime dependencies. Acceleration packages are separate optional installs."
---

# Migration 2.4 → 3.0

v3 is backward compatible for 2.4 callers. Published package versions stay on the 2.4 line until the v3 release; the APIs below are already in this repository as additive entries.

What is new, all optional:

- `makeFeed` on `fromAsyncIterableSteps` and `parseStream`. Omit it and the default tracked feed is used. `openPath` and `tailOpen` stay on the step. See [v3 feeds](v3.md).
- `@adaptate/core/verify` for fail-closed in-memory checks (issue 84): `hashBuffer`, `verifyBuffer`, `verifyStream`. This is a new subpath of zero-dependency `@adaptate/core`. See [Runtime verification](verification.md).
- Optional Advanced packages `@adaptate/accel`, `@adaptate/wasm`, and `@adaptate/native`, plus the Rust core they wrap. Install them only for large buffers, multi-MB verification, or a host embed. They are not peers of `@adaptate/core` and they do not load from the default install. See [Acceleration](accel.md).

What does not change:

- The default install remains `adaptate` / `@adaptate/core` plus the `zod` peer, with `effect`, `js-yaml`, and the ref parser still optional as in [Migration 2.4](migration-2.4.md).
- Existing subpaths (`/stream`, `/stream-incremental`, `/standard`, `/effect`, `/result`) keep their current imports.
- Small streaming chunks should stay on the JS parser. Measured SHA-256 at 1 KiB, 32 KiB, and 2 MiB was faster in JS than WASM or native on the Track 2 real-binary run.

If you already consume 2.4, upgrade when the v3 npm release ships, then add only the new imports you want. No rewrite is required.
