#!/usr/bin/env bash
# Fast local hook: TypeScript typecheck + Vitest only.
# Full CI parity: run `pnpm build` (turbo pipeline: check-types → test → build).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "pre-commit: Running typecheck..."
npx turbo run check-types

echo "pre-commit: Running tests..."
npx vitest run --coverage
