# AGENTS.md - @adaptate/utils Package Guidelines

## Overview
Utilities for converting between OpenAPI schemas and Zod schemas, and loading OpenAPI YAML specs with full `$ref` resolution.

## Structure
- `src/index.ts`: Re-exports from `openapi.ts` (no logic)
- `src/openapi.ts`: Core conversion functions (`openAPISchemaToZod`, `zodToOpenAPISchema`, `getDereferencedOpenAPIDocument`)
- `src/load-yaml.ts`: Node-only filesystem YAML loading (`getYamlContent`)
- `src/__tests__/openapi.test.ts`: Unit tests including network-dependent Google Books spec test
- `src/fixtures/base-schema.yml`: Test fixture

## Key Patterns
- `openAPISchemaToZod`: Converts JSON Schema / OpenAPI schema objects to Zod schemas (handles `$ref`, `allOf`, `oneOf`, `anyOf`, nested objects, arrays, enums)
- `zodToOpenAPISchema`: Reverse conversion (basic, not 1:1 complete)
- `getDereferencedOpenAPIDocument`: Loads and fully dereferences an OpenAPI spec (uses `@apidevtools/json-schema-ref-parser`)
- `getYamlContent`: Dynamic import of `load-yaml.ts` for Node-only YAML file reading (split for browser compat)

## Build
- **Two Vite builds**: browser lib (`build/`) and SSR (`ssr-build/`)
- Browser build externalizes Node builtins; SSR build includes `openapi.ts` as separate entry
- Exports: `.` (browser), `./openapi` (SSR entry), `./ssr` and `./ssr/*` (SSR bundle)

## Rules
- `zod` is a peer dependency — never bundle it
- `@apidevtools/json-schema-ref-parser` and `js-yaml` are runtime dependencies
- Tests may hit the network (Google Books OpenAPI URL) — wrapped in try/catch
- Run vitest from workspace root (no per-package test script)
