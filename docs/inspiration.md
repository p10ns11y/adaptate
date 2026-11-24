---
title: "Inspiration"
description: "Ideas this library borrows, starting with overreacted.io (Dan Abramov)."
answer: "adaptate parses strict JSON incrementally as it streams in and validates each partial value against your schema. Pull request 83 was inspired by Progressive JSON."
---

# Inspiration

Ideas this library borrows, and where to read more.

## [overreacted.io](https://overreacted.io), Dan Abramov

adaptate parses strict JSON incrementally as it streams in and validates each partial value against your schema. `parseStream` and `fromAsyncIterableSteps` yield those steps.

[#83](https://github.com/p10ns11y/adaptate/pull/83) was inspired by "Progressive JSON": `openPath` and `tailOpen` on each step, `isSettled`, and the branded `Result` with `isResult`.

Progressive JSON streams a response breadth-first, with placeholders for parts that are not ready, and fills them in later in any order. That is the producer's job (the server, or the SI response format), not a validation library's, and it is not a common standard yet. If it becomes one, adaptate may add support for it or experiment with it.

- [Algebraic Effects for the Rest of Us](https://overreacted.io/algebraic-effects-for-the-rest-of-us/): a function performs an effect, a handler higher up the call stack supplies a value, and the function resumes where it stopped, like a `try/catch` that can continue.
- [Progressive JSON](https://overreacted.io/progressive-json/): the post that describes that streaming model.
