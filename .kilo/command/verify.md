# Verify Command

## Purpose
Run quality gates to ensure code changes pass all checks before commits.

## Steps
1. Run `npx turbo run check-types` to verify TypeScript types across all packages.
2. Run `npx vitest run --coverage` to execute all tests with coverage.
3. Run `pnpm build` to verify the full build pipeline (check-types → test → build).
4. If all pass, proceed with commit. If any fail, fix issues first.

## Rules
- Always run verify before committing changes.
- Escalate failures to user for resolution.
- No commits without passing all gates.
- Coverage should remain at or above current levels.
