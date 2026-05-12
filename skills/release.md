# Skill: Release

## Overview
Prepare a version bump and ensure the package is ready for publishing to npm.

## When to use
- New features or fixes are ready for consumers
- Breaking changes require a major version bump
- The CI release workflow needs to be triggered

## Steps

1. **Verify everything passes**:
   ```
   npx turbo run check-types
   npx vitest run --coverage
   pnpm build
   ```
   All gates must pass before any version change.

2. **Determine version bump** (semver):
   - **Patch** (`x.y.Z`): Bug fixes, documentation, non-breaking improvements
   - **Minor** (`x.Y.0`): New features, backward-compatible additions
   - **Major** (`X.0.0`): Breaking API changes, removed features, changed behavior

3. **Update version** in relevant `package.json` files:
   - Root `package.json` (the meta-package that points to core)
   - `packages/core/package.json` if core changed
   - `packages/utils/package.json` if utils changed
   - Keep versions in sync across the monorepo

4. **Update CHANGELOG** (if one exists) or add release notes to the commit message.

5. **Commit the version bump**:
   ```
   git add package.json packages/*/package.json
   git commit -m "chore: release vX.Y.Z"
   ```

6. **Push to main**: The GitHub Actions workflow (`.github/workflows/release.yml`) triggers on version changes in `package.json` paths and publishes to npm automatically.

## Validation
- [ ] All quality gates pass
- [ ] Version follows semver correctly
- [ ] All affected package.json files are updated
- [ ] Commit message follows convention
- [ ] CI workflow will be triggered by the paths changed

## Rules
- Never publish manually — use the CI workflow
- Version bump commits should contain only version changes (no code changes)
- Breaking changes must be documented in README
- Coordinate version bumps across packages when they depend on each other
- The `packageManager` field in root `package.json` should remain pinned to `pnpm@1.11.1` 
