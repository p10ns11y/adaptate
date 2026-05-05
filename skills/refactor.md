# Skill: Refactor

## Overview
Restructure existing code to improve clarity, maintainability, or performance without changing observable behavior.

## When to use
- Code is correct but hard to understand or maintain
- Duplicated logic should be extracted into shared utilities
- Naming does not match domain vocabulary (see `.cursor/rules/naming-and-readability.mdc`)
- Performance improvements that preserve the API contract

## Steps

1. **Ensure test coverage**: Before refactoring, verify that the code being changed has adequate test coverage.
   - Run `npx vitest run --coverage` and check the relevant files
   - If coverage is insufficient, add tests first (see `add-test.md`)
   - Tests are your safety net — refactoring without them risks silent regressions

2. **Define the refactoring goal**: Be explicit about what you're improving.
   - Clarity: better names, simpler control flow
   - Deduplication: extract shared logic
   - Performance: reduce allocations, avoid redundant traversals
   - Structure: move code to more appropriate modules

3. **Apply the refactoring**:
   - Make small, incremental changes
   - Follow `CODING_STYLE.md` and naming conventions
   - Preserve all public API signatures unless this is explicitly a breaking change
   - Update internal type annotations to match new structure

4. **Run the full verification suite**:
   ```
   npx turbo run check-types
   npx vitest run --coverage
   pnpm build
   ```

5. **Verify behavioral equivalence**: All existing tests must pass without modification.
   - If a test needs updating, that means behavior changed — reconsider whether this is truly a refactor
   - Exception: inline snapshot content may change if output formatting changed (review carefully)

## Validation
- [ ] All existing tests pass without modification
- [ ] Type checking passes
- [ ] Build succeeds
- [ ] No public API signatures changed (unless intentional breaking change)
- [ ] Code is measurably more readable/maintainable

## Rules
- Never refactor and add features in the same commit — separate concerns
- Tests that need updating signal a behavior change, not a refactor
- Use `refactor: description` commit message format
- Apply the Higher-Order Decision Architect framework (`.cursor/rules/higher-order-decision-architect.mdc`) for significant structural changes
- Prefer smaller, reviewable diffs over large sweeping changes
