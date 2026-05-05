# Skills

Tool-agnostic operational guides for coding agents working on this repository.

## What are skills?

Skills are structured Standard Operating Procedures (SOPs) that any coding agent — Cursor, Claude Code, Copilot, Windsurf, Cline, Kilo, Aider, or others — can read and follow to perform common development tasks correctly and consistently.

## How agents discover skills

Agents should:
1. Read `AGENTS.md` at the root (or in the relevant package) for project context.
2. Check this `skills/` directory for task-specific guides when performing that type of work.
3. Follow the steps, rules, and validation criteria in the relevant skill file.

## Available skills

| Skill | File | When to use |
|-------|------|-------------|
| Add Feature | [`add-feature.md`](add-feature.md) | Implementing a new capability in core or utils |
| Fix Bug | [`fix-bug.md`](fix-bug.md) | Investigating and fixing a reported issue |
| Verify | [`verify.md`](verify.md) | Running quality gates before committing |
| Add Test | [`add-test.md`](add-test.md) | Writing new tests for existing or new code |
| Refactor | [`refactor.md`](refactor.md) | Restructuring code without changing behavior |
| Release | [`release.md`](release.md) | Preparing a version bump for publishing |

## Conventions

- Each skill is a standalone Markdown file with: Overview, When to use, Steps, Validation, Rules.
- Steps are numbered and imperative ("Run X", "Create Y", "Verify Z").
- Validation describes what a successful completion looks like.
- Rules are non-negotiable constraints that apply during execution.
- Skills reference `AGENTS.md` and `CODING_STYLE.md` for conventions rather than duplicating them.
