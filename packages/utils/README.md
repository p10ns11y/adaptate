# @adaptate/utils

OpenAPI ↔ Zod, plus spec loading. In-document `$ref`s are resolved locally.

```sh
pnpm add @adaptate/utils
```

Peer: `zod@^3.25.0 || ^4.0.0`. No required runtime dependencies.

Network: only `fetchYamlContent(webURL)` and `getDereferencedOpenAPIDocument({ location: 'web' })` call `fetch`, and only on the URL you pass.

| Doc | |
| --- | --- |
| [OpenAPI](../../docs/openapi.md) | Load a spec, convert both ways |
| [Optional peers](../../docs/optional-peers.md) | `js-yaml`, `@apidevtools/json-schema-ref-parser` |
| [Subpaths](../../docs/subpaths.md) | Browser bundle and `/ssr` |
| [Development](../../docs/development.md) | pnpm at the repo root |
