# Live load

A static page that streams a seeded tool-call load for 60 seconds. Refresh replays the same run.

The worker emits AG-UI `TOOL_CALL_ARGS`, OpenAI tool-call argument deltas, and Anthropic `input_json_delta`. Payloads include 20 KB strings, 1,000-item arrays, and several calls in parallel. The page charts `@adaptate/core/stream` against `@adaptate/core/stream-incremental`.

Build the packages first. The page typechecks the usage files, then writes a static `dist` folder. Nothing here is published.

```sh
pnpm --filter @adaptate/core build
pnpm --filter @adaptate/utils build
pnpm --filter adaptate-live-load build
pnpm --filter adaptate-live-load test
pnpm --filter adaptate-live-load preview
```
