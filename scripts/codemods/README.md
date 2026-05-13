# Codemods (optional)

Use **small, explicit transforms** when a dependency documents repeatable API renames (for example Zod major upgrades).

- Prefer **`tsx`** + **ts-morph** or **jscodeshift** for AST-safe edits.
- Run **`pnpm lint`** (Oxlint + ESLint deprecation) and **`pnpm test`** after any codemod.
- Do **not** treat ESLint `@typescript-eslint/no-deprecated` autofix as complete—it usually does not rewrite calls.

See [`skills/verify.md`](../skills/verify.md) for the full gate sequence.
