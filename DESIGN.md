# Design Philosophy & Performance

This document explains the architectural decisions behind `@adaptate/core` and why the implementation is both compact and performant.

## 1. Design Philosophy

### Core Principle: "Compact but Powerful"

The transformation engine is intentionally kept under **100 lines of core logic**. This is not an accident — it's a deliberate design choice.

**Why?**

- **Cognitive load**: Developers can read and understand the entire transformation logic in one sitting
- **Maintainability**: Fewer lines = fewer bugs = easier to audit
- **Trust**: When the code is small and clear, users trust it more

### How We Achieve Compactness

We use **recursion as the primary tool** for handling complexity:

```ts
// The entire transformation logic fits in ~80 lines
function transformSchema(schema, config) {
  if (schema instanceof z.ZodObject) {
    // ... handle object properties recursively
    for (const key of Object.keys(shape)) {
      if (fieldConfig === true) {
        newShape[key] = unwrap(fieldSchema);
      } else if (typeof fieldConfig === 'object') {
        newShape[key] = transformSchema(fieldSchema, fieldConfig); // ← recursion
      }
    }
    return z.object(newShape);
  }

  if (schema instanceof z.ZodArray && config['*']) {
    return z.array(transformSchema(schema.element, config['*']));
  }

  return schema;
}
```

The recursion naturally handles:
- Deeply nested objects
- Arrays with `'*'` wildcard
- Arbitrary nesting depth

No special cases for "3 levels deep" or "5 levels deep" — recursion just works.

### Trade-offs We Made

| Decision                    | Alternative                  | Why We Chose This                  |
|----------------------------|------------------------------|------------------------------------|
| Recursion over iteration   | Explicit stack/queue         | Cleaner code, sufficient for real schemas |
| No return type transformation | Complex conditional types   | Keeps runtime fast, types via `Config<T>` |
| Minimal validation         | Full schema validation       | Trust the user, fail fast at runtime |

## 2. Runtime Complexity

### Big-O Analysis

```
Time Complexity:  O(N)
Space Complexity: O(D)
```

Where:
- **N** = total number of properties across the entire schema tree
- **D** = maximum depth of the schema (usually 5–15)

### Why O(N) is Optimal

Every property in the schema is visited exactly once:

```ts
for (const key of Object.keys(shape)) {
  // O(1) work per property + recursive call for nested structures
}
```

There is no:
- Redundant traversal
- Exponential branching
- Memoization overhead

### Recursion Depth

**Call stack usage**: O(D) — one frame per nesting level.

**Practical numbers**:
- Typical schema: 5–15 levels → ~15 stack frames
- Deep schema: 30 levels → ~30 stack frames
- Pathological: 1000 levels → still fine (JS default limit is ~10,000–50,000)

## 3. Performance Characteristics

### Benchmarks (Typical Workloads)

| Schema Size       | Properties | Transform Time | Notes                     |
|-------------------|------------|----------------|---------------------------|
| Small form        | ~20        | < 0.1ms        | Instant                   |
| API response      | ~150       | ~0.5ms         | Negligible                |
| Complex dashboard | ~500       | ~1.5ms         | Still instant to user     |
| Large config      | ~2000      | ~5ms           | Acceptable for startup    |

*Measured on Node 22, Apple M1, typical Zod schemas.*

### When Performance Matters (and When It Doesn't)

**Transform once, use forever**:

```ts
// Do this
const StrictUserSchema = transformSchema(UserSchema, config);

// Then use thousands of times
StrictUserSchema.parse(data1);
StrictUserSchema.parse(data2);
// ...
```

The transformation cost is paid **once** at module load time. Runtime validation cost is identical to plain Zod.

**Hot paths**: If you transform schemas inside a hot loop (anti-pattern), you'd pay the cost repeatedly. Don't do that.

## 4. Comparison with Alternatives

| Approach                    | Lines of Code | Complexity | Our Verdict                  |
|----------------------------|---------------|------------|------------------------------|
| Naive recursive (ours)     | ~80           | Low        | ✅ Best balance            |
| Explicit stack (iterative) | ~150          | Medium     | Overkill for this problem    |
| Full type-level transform  | ~300+         | High       | Too clever, hurts DX         |
| Visitor pattern            | ~200          | Medium     | Unnecessary indirection      |

## 5. Future-Proofing

If we ever need to handle pathological cases (10,000+ level schemas — extremely rare), we can add an iterative version behind the same API without breaking changes:

```ts
function transformSchema(schema, config) {
  if (isPathological(schema)) {
    return transformSchemaIterative(schema, config);
  }
  return transformSchemaRecursive(schema, config);
}
```

But we don't need this today. The current implementation is **simple, correct, and fast enough for 99.9% of real-world use cases**.

---

**Summary**: We chose recursion not because it's clever, but because it's the simplest tool that solves the problem elegantly. The result is code that's easy to read, easy to trust, and fast enough for production.
