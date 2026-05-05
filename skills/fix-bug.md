# Skill: Fix Bug

## Overview
Investigate, reproduce, and fix a reported bug in the adaptate library.

## When to use
- A user reports incorrect schema transformation behavior
- A test is failing unexpectedly
- OpenAPI conversion produces incorrect output
- Runtime errors occur during schema parsing

## Steps

1. **Reproduce**: Write or identify a minimal test case that demonstrates the bug.
   - Create a failing test in the relevant `src/__tests__/` directory
   - The test should pass after the fix is applied
   - Include the exact input (schema + config) and expected vs actual output

2. **Investigate root cause**: Trace the execution path.
   - For core bugs: trace through `transformSchema` or `makeConditionalSchemaTransformer` recursion
   - For utils bugs: trace through `openAPISchemaToZod` / `zodToOpenAPISchema` conversion
   - Check edge cases: optional vs required, nested objects, arrays, conditionals

3. **Fix**: Apply the minimal change that resolves the bug.
   - Prefer targeted fixes over broad refactors
   - Ensure the fix handles related edge cases (not just the reported case)
   - Follow `CODING_STYLE.md` conventions

4. **Verify the fix**: Run the reproduction test — it should now pass.

5. **Run full suite**: `npx vitest run --coverage`
   - Ensure no regressions
   - Ensure coverage is maintained

6. **Type check**: `npx turbo run check-types`

7. **Build**: `pnpm build` to verify the full pipeline still works.

## Validation
- [ ] A test exists that would fail without the fix
- [ ] That test passes with the fix applied
- [ ] No other tests have regressed
- [ ] Type checking passes
- [ ] Build succeeds

## Rules
- Always write a regression test before or alongside the fix
- Do not change unrelated code in the same commit
- If the bug reveals a design flaw, note it but fix only the immediate issue (refactor separately)
- Use `fix: description` commit message format
