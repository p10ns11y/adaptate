---
title: "Optional peers"
description: "effect, js-yaml, and the ref parser load only when that code is imported."
---

# Optional peers

| Package | Peer | When it loads |
| --- | --- | --- |
| `@adaptate/core` | `effect@^4.0.0` | Only `@adaptate/core/effect` |
| `@adaptate/utils` | `js-yaml@^5.5.0` | Only while parsing YAML |
| `@adaptate/utils` | `@apidevtools/json-schema-ref-parser@^16.0.8` | Only for a remote or file `$ref` |

`zod@^3.25.0 || ^4.0.0` is required for both packages. Neither package has a `dependencies` field.

In-document `$ref` pointers use the local resolver (`packages/utils/src/dereference-local.ts`). JSON specs need no extra package.

A missing YAML parser throws:

```
Optional peer dependency "js-yaml" is required to parse YAML. Install it with `pnpm add js-yaml`.
```

A missing ref parser throws:

```
Optional peer dependency "@apidevtools/json-schema-ref-parser" is required to resolve remote or file $ref pointers. Install it with `pnpm add @apidevtools/json-schema-ref-parser`.
```

js-yaml 5 ships its own types. `@types/js-yaml` is not a dependency.
