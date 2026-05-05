# Skill: Add Feature

## Overview
Implement a new capability in the adaptate monorepo, covering planning, implementation, testing, and validation.

## When to use
- User requests a new function, type, or behavior in `@adaptate/core` or `@adaptate/utils`.
- Extending the public API surface of either package.
- Adding support for new Zod types, OpenAPI constructs, or config patterns.

## Steps

1. **Identify scope**: Determine which package(s) are affected.
   - Schema transformation logic → `packages/core/`
   - OpenAPI conversion, YAML loading → `packages/utils/`
   - Cross-cutting → both packages

2. **Design the API**: Before writing code, define:
   - Function signature(s) and types
   - Config shape (if extending `Config`)
   - Expected behavior for edge cases
   - Whether this is a breaking change (requires semver major)

3. **Implement**: Write the implementation.
   - Follow `CODING_STYLE.md` (strict TypeScript, no `any`, domain-specific naming)
   - Follow Zod patterns: `unwrap()` for optionality, `instanceof` for type narrowing
   - If extending core, ensure the recursive traversal handles the new case

4. **Write tests**: Add tests in `src/__tests__/`.
   - Test both success paths and error/validation failure paths
   - Use `toMatchInlineSnapshot` for structural assertions
   - Use `toThrowErrorMatchingInlineSnapshot` for Zod error messages
   - Test with nested/recursive schemas when applicable
   - Add fixtures in `src/fixtures/` if needed (YAML/JSON)

5. **Type check**: Run `npx turbo run check-types`

6. **Run tests**: Run `npx vitest run --coverage`
   - Verify all tests pass
   - Verify coverage has not dropped

7. **Build**: Run `pnpm build` (full pipeline: check-types → test → build)

8. **Verify exports**: Ensure new public API is exported via `package.json` `exports` field if it should be accessible to consumers.

## Validation
- [ ] `npx turbo run check-types` passes with no errors
- [ ] `npx vitest run --coverage` shows all tests passing
- [ ] Coverage remains at or above current baseline (100% statements)
- [ ] `pnpm build` succeeds without warnings (except known Vite externalization messages)
- [ ] New functionality is exercised by at least one test

## Rules
- `zod` is a peer dependency — never add it as a direct/bundled dependency
- Cross-package changes require testing both packages together
- Breaking API changes require documentation in the package README
- Do not modify existing test inline snapshots unless the change is intentional
- Commit atomically: implementation + tests in one logical commit
