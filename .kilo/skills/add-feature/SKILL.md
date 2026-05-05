# Add Feature Skill

## Overview
Guide agents on implementing new features in adaptate, covering planning, execution, and validation across the monorepo.

## Steps
1. **Plan Feature**: Analyze requirements, determine which package(s) are affected (core, utils, or both).
2. **Design API**: Define the public API surface — types, function signatures, config shapes.
3. **Implement**: Write the implementation with strict TypeScript, following Zod patterns in `CODING_STYLE.md`.
4. **Add Tests**: Write Vitest tests in `src/__tests__/` with inline snapshots for both success and error cases.
5. **Type Check**: Run `npx turbo run check-types` to verify no type errors.
6. **Test**: Run `npx vitest run --coverage` to verify all tests pass with coverage.
7. **Build**: Run `pnpm build` to verify the full pipeline works.
8. **Review**: Ensure public API exports are correct in package.json `exports` field.

## Rules
- Follow AGENTS.md guidelines
- Maintain test coverage (aim for 100% statements)
- Never bundle `zod` — keep it as peer dependency
- Cross-package changes require testing both packages
- Update inline snapshots when intentionally changing output
- Escalate on build/test failures
