# Skill: Verify

## Overview
Run the full quality gate sequence to ensure code is ready for commit and push.

## When to use
- Before every commit (automated via `.husky/pre-commit`)
- Before pushing to remote
- After any implementation work
- When reviewing whether a branch is ready to merge

## Steps

1. **Type check all packages**:
   ```
   npx turbo run check-types
   ```
   Both `@adaptate/core` and `@adaptate/utils` must pass `tsc --noEmit`.

2. **Run tests with coverage**:
   ```
   npx vitest run --coverage
   ```
   All tests must pass. Coverage must not drop below current baseline.

3. **Full build pipeline** (optional but recommended before push):
   ```
   pnpm build
   ```
   This runs the entire Turborepo graph: check-types → test → build for all packages.

4. **Review results**:
   - Type errors → fix TypeScript issues
   - Test failures → investigate and fix (see `fix-bug.md`)
   - Build failures → check Vite config and external dependencies
   - Coverage drop → add missing tests (see `add-test.md`)

## Validation
- [ ] `npx turbo run check-types` exits 0
- [ ] `npx vitest run --coverage` exits 0 with all tests passing
- [ ] `pnpm build` exits 0 (when running full verification)
- [ ] No uncommitted debugging code remains

## Rules
- Never commit with failing type checks or tests
- Never force-push to bypass failures
- If a test is intentionally changed, update inline snapshots explicitly (`npx vitest run -u`)
- Escalate persistent failures to the user rather than suppressing
