# @adaptate/core

One Zod schema. A config chooses the required fields for each consumer.

```sh
pnpm add @adaptate/core
```

Peer: `zod@^3.25.0 || ^4.0.0`. No runtime dependencies. Optional peer `effect@^4.0.0` is used only by `@adaptate/core/effect`.

| Doc | |
| --- | --- |
| [Subpaths](../../docs/subpaths.md) | `.`, `./stream`, `./stream-incremental`, `./standard`, `./effect`, `./result` |
| [Choke points](../../docs/choke-points.md) | `parse` to an ok or error track |
| [Transform](../../docs/transform.md) | `transformSchema`, conditional configs |
| [Streaming](../../docs/streaming.md) | Partial JSON and AG-UI |
| [Effect](../../docs/effect.md) | `final(text)` per config |
| [Development](../../docs/development.md) | pnpm at the repo root |
