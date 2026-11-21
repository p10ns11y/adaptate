# Codemods (optional)

Use **small, explicit transforms** when a dependency documents repeatable API renames (for example Zod major upgrades).

- Prefer **`tsx`** + **ts-morph** or **jscodeshift** for AST-safe edits.
- Run **`pnpm lint`** (Oxlint type-aware, including `typescript/no-deprecated`) and **`pnpm test`** after any codemod.
- Do **not** treat Oxlint `typescript/no-deprecated` autofix as complete—it usually does not rewrite calls.

See [`skills/verify.md`](../skills/verify.md) for the full gate sequence.
