---
title: "Runtime verification"
description: "Fail-closed in-memory hooks that verify a buffer before any bytes are written to disk."
answer: "v3 adds fail-closed in-memory verification hooks (issue 84). A hook can hash a buffer, check size, type, name, or provenance, and run a formal check — all before anything is written. If a check fails, the bytes stay in memory and are discarded."
faq:
  - question: "What happens when a check fails?"
    answer: "The hook fails closed. Nothing is stored. You get a typed error for the check that failed, and the buffer is discarded."
  - question: "Can I add my own check?"
    answer: "Yes. Built-in hooks cover hash and metadata. Pass your own verifier for a formal spec or an extra property. Antivirus engines are out of scope."
---

# Runtime verification

A download or a stream should not touch the disk until it has been checked. [Issue 84](https://github.com/p10ns11y/adaptate/issues/84) adds runtime hooks for that: hash, size, media type, name, signature or provenance, and a slot for a formal spec.

The hook runs on a buffer or a stream in memory. If any check fails, nothing is stored.

| Check | When it runs | On failure |
| --- | --- | --- |
| SHA-256 (or another digest) | Over the in-memory bytes | Typed hash error, bytes discarded |
| Size, media type, name | Against an expected manifest | Typed metadata error, bytes discarded |
| Signature or provenance | When the manifest includes it | Typed provenance error, bytes discarded |
| Formal spec or custom verifier | After the built-in checks, still in memory | Typed verifier error, bytes discarded |

```ts
import { parseStream } from "@adaptate/core/result";

const result = parseStream(source, schema, {
  verify: (buffer) => verifyBuffer(buffer, manifest),
});
```

`manifest` holds the expected digest, size, media type, name, and any provenance. `verifyBuffer` is the hook you pass; `@adaptate/accel` can run the hash on large buffers.

Pair this with [`makeFeed`](v3.md) when the bytes arrive as a stream, and with [`@adaptate/accel`](accel.md) when the hash or batch is large. Fail closed, always: a hook that cannot decide does not write.
