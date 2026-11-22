---
title: "Migration 2.4"
description: "YAML and the ref parser became optional peers between 2.3 and 2.4."
answer: "Version 2.4 of @adaptate/utils makes js-yaml and the JSON Schema ref parser optional peers. Install js-yaml only to parse YAML, and the ref parser only for remote or file $ref pointers."
faq:
  - question: "Do I need to change code to upgrade?"
    answer: "No code change is needed. Install the optional peers your app uses."
  - question: "What is new in @adaptate/core?"
    answer: "@adaptate/core/standard validates a Standard Schema, and @adaptate/core/effect runs checks in Effect."
---

# Migration 2.3 → 2.4

Published 2.3.0 of `@adaptate/utils` depended on `@apidevtools/json-schema-ref-parser@^15.3.5` and `js-yaml@^4.1.1`.

2.4 makes both optional:

- Install `js-yaml@^5.5.0` if you parse YAML.
- Install `@apidevtools/json-schema-ref-parser@^16.0.8` if you resolve remote or file `$ref`s.
- In-document `$ref`s stay on the local resolver. JSON specs need neither package.

[#51](https://github.com/p10ns11y/adaptate/pull/51) moved those packages from parser 15 and js-yaml 4 to parser 16 and js-yaml 5, and dropped `@types/js-yaml` because js-yaml 5 ships its types. The Zod peer stays `^3.25.0 || ^4.0.0`. `@adaptate/core` still has no runtime dependencies.

`@adaptate/core/standard` validates a Standard Schema (`~standard.validate`) and adds no dependency. The test uses a transformed Zod schema and a hand-written schema ([`standard.test.ts`](../packages/core/src/__tests__/standard.test.ts)).

`@adaptate/core/effect` is new. Install `effect@^4.0.0` only if you import it. `final(text)` and `final(text, configName)` are in [Effect](effect.md).
