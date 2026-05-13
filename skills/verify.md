# Skill: Verify

## Overview
Run the full quality gate sequence to ensure code is ready for commit and push.

Install dependencies with **`pnpm install`** in this monorepo only. **`npm install`** at the repo root is unsupported — it sidesteps the intended **supply-chain protections** in `.npmrc` and `pnpm-workspace.yaml` and can mismatch CI. Root `package.json` sets `packageManager`.

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

2. **Lint** (Oxlint + ESLint deprecations):
   ```
   pnpm lint
   ```
   Or: `npx oxlint -c .oxlintrc.json ./packages/core/src ./packages/utils/src` and `pnpm run lint:deprecation` for ad-hoc runs from the repo root.

3. **Run tests with coverage**:
   ```
   npx vitest run --coverage
   ```
   All tests must pass. Coverage must not drop below current baseline.

4. **Full build pipeline** (optional but recommended before push):
   ```
   pnpm build
   ```
   This runs the entire Turborepo graph: check-types → test → build for all packages.

5. **Review results**:
   - Type errors → fix TypeScript issues
   - Lint failures → fix Oxlint findings or deprecated APIs reported by ESLint
   - Test failures → investigate and fix (see `fix-bug.md`)
   - Build failures → check Vite config and external dependencies
   - Coverage drop → add missing tests (see `add-test.md`)

## Validation
- [ ] `npx turbo run check-types` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `npx vitest run --coverage` exits 0 with all tests passing
- [ ] `pnpm build` exits 0 (when running full verification)
- [ ] No uncommitted debugging code remains

## Rules
- Never commit with failing type checks, lint, or tests
- Never force-push to bypass failures
- If a test is intentionally changed, update inline snapshots explicitly (`npx vitest run -u`)
- Escalate persistent failures to the user rather than suppressing
