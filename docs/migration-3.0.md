---
title: "Migration 3.0"
description: "Existing stream callers keep working in 3.0. makeFeed, @adaptate/core/verify, and optional acceleration are opt-in."
answer: "Version 3.0 of @adaptate/core keeps existing fromAsyncIterableSteps and parseStream callers working. Pass an optional makeFeed factory only when you need a custom feed. @adaptate/core/verify adds fail-closed in-memory checks, and optional @adaptate/accel can size-route large buffers."
faq:
  - question: "Do I need to change code to upgrade?"
    answer: "No. Existing fromAsyncIterableSteps and parseStream callers keep working. makeFeed is an optional argument with the same default feed."
  - question: "What is new in @adaptate/core?"
    answer: "An optional makeFeed factory, the @adaptate/core/verify subpath for in-memory checks, and openPath and tailOpen on stream steps."
---

# Migration 2.4 → 3.0

3.0 is backward compatible for existing stream callers.

`fromAsyncIterableSteps` and `parseStream` accept an optional `makeFeed` factory as their last argument, the same shape already used by `agUiValidatorWith` and `createEffectStreamValidator`. Omit it and the default tracked feed is used. `openPath` and `tailOpen` stay on each step.

`@adaptate/core/verify` is new and has no runtime dependencies. Use `verifyBuffer` or `verifyStream` with a manifest (hash, size, mime, name) or custom verifiers. A failed check returns failures and does not write the bytes.

Optional `@adaptate/accel`, `@adaptate/wasm`, and `@adaptate/native` packages can size-route large buffers (JavaScript below about 32 KiB, then native, then wasm, then JavaScript). They are workspace packages in this repository and are not published with the 3.0.0 npm release of `adaptate`, `@adaptate/core`, and `@adaptate/utils`. `@adaptate/core` stays the default path.

[#90](https://github.com/p10ns11y/adaptate/pull/90) added the hook and verifier. [#92](https://github.com/p10ns11y/adaptate/pull/92) added the optional acceleration packages. The architecture is in [#89](https://github.com/p10ns11y/adaptate/issues/89).
