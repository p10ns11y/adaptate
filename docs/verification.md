---
title: "Runtime verification"
description: "Fail-closed in-memory hooks that verify a buffer before any bytes are written to disk."
answer: "v3 adds @adaptate/core/verify for fail-closed in-memory checks (issue 84). hashBuffer, verifyBuffer, and verifyStream can hash a buffer, check size, type, or name, and run a formal or custom verifier — all before anything is written. If a check fails, the bytes stay in memory and are discarded."
faq:
  - question: "What happens when a check fails?"
    answer: "The hook fails closed. Nothing is stored. You get a typed error for the check that failed, and the buffer is discarded."
  - question: "Can I add my own check?"
    answer: "Yes. Built-in hooks cover hash and metadata. Pass formal or custom verifiers for a spec or an extra property. Antivirus engines are out of scope."
---

# Runtime verification

A download or a stream should not touch the disk until it has been checked. [Issue 84](https://github.com/p10ns11y/adaptate/issues/84) is covered by `@adaptate/core/verify`: hash, size, media type, name, and a slot for a formal or custom verifier.

The hook runs on a buffer or a stream in memory. If any check fails, nothing is stored.

| Check | When it runs | On failure |
| --- | --- | --- |
| SHA-256 (or SHA-384 / SHA-512) | Over the in-memory bytes | Typed hash error, bytes discarded |
| Size, media type, name | Against an expected manifest | Typed metadata error, bytes discarded |
| Formal spec or custom verifier | After the built-in checks, still in memory | Typed verifier error, bytes discarded |

```ts
import { verifyBuffer, verifyStream } from "@adaptate/core/verify";

const checked = await verifyBuffer(bytes, {
  hash: { value: expectedSha256 },
  size: bytes.byteLength,
});

if (!checked.ok) {
  checked.failures;
}

const streamed = await verifyStream(chunks, {
  hash: { algorithm: "SHA-256", value: expectedSha256 },
});
```

`@adaptate/core/verify` is part of zero-dependency `@adaptate/core`. For a large or batched buffer, `@adaptate/accel` can size-route the same kind of check; see [Acceleration](accel.md). Pair this with [`makeFeed`](v3.md) when the bytes arrive as a stream.

This page lives under Advanced because the hooks are for in-memory verification of untrusted buffers, not for ordinary field checks on a small tool-call chunk. Fail closed, always: a hook that cannot decide does not write.
