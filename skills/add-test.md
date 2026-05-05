# Skill: Add Test

## Overview
Write new automated tests to improve coverage or validate specific behavior.

## When to use
- Existing code lacks test coverage
- A new edge case has been identified
- Documenting expected behavior for complex logic
- After fixing a bug (regression test)

## Steps

1. **Identify what to test**: Determine the function/behavior and which scenarios need coverage.
   - Happy path (valid input → expected output)
   - Error path (invalid input → appropriate error)
   - Edge cases (empty inputs, deeply nested schemas, boundary conditions)

2. **Choose test location**:
   - `packages/core/src/__tests__/index.test.ts` for schema transformation
   - `packages/utils/src/__tests__/openapi.test.ts` for OpenAPI conversion
   - Create a new test file only if testing a clearly separate module

3. **Write the test**:
   ```typescript
   import { describe, it, expect } from 'vitest';
   
   describe('featureName', () => {
     it('should handle specific case', () => {
       // Arrange
       const schema = z.object({ ... });
       const config = { ... };
       
       // Act
       const result = transformSchema(schema, config);
       
       // Assert
       expect(result.parse(validData)).toMatchInlineSnapshot(`...`);
     });
     
     it('should throw for invalid input', () => {
       expect(() => result.parse(invalidData))
         .toThrowErrorMatchingInlineSnapshot(`...`);
     });
   });
   ```

4. **Use inline snapshots**: Run `npx vitest run -u` to auto-generate snapshot content, then review it for correctness.

5. **Add fixtures** (if needed): Place YAML/JSON fixtures in `src/fixtures/` next to the test directory.

6. **Run and verify**: `npx vitest run --coverage`

## Validation
- [ ] New tests pass
- [ ] Existing tests still pass (no regressions)
- [ ] Coverage has improved or remained stable
- [ ] Inline snapshots accurately reflect expected behavior

## Rules
- Use inline snapshots (`toMatchInlineSnapshot`, `toThrowErrorMatchingInlineSnapshot`) over external snapshot files
- Import from `vitest` explicitly (`describe`, `it`, `expect`)
- One logical assertion per `it()` block (multiple `expect` calls are fine if testing one behavior)
- Test real Zod schemas — do not mock Zod internals
- Cross-package imports use `#utils/openapi` alias (not relative paths to other packages)
