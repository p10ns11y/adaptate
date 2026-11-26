---
title: "Function: fromAsyncIterableSteps()"
description: "Exported from @adaptate/core/stream-incremental."
---

# Function: fromAsyncIterableSteps()

> **fromAsyncIterableSteps**(`source`, `makeFeed?`): `AsyncGenerator`\<[`TrackedStep`](../type-aliases/TrackedStep.md)\>

## Parameters

### source

`AsyncIterable`\<`string` \| `Uint8Array`\<`ArrayBufferLike`\>\>

### makeFeed?

() => [`TrackedFeed`](../type-aliases/TrackedFeed.md)

## Returns

`AsyncGenerator`\<[`TrackedStep`](../type-aliases/TrackedStep.md)\>
