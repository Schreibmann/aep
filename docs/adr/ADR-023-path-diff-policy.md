# ADR-023 — Path and diff policy

## Status

Accepted (AEP-033)

## Context

Implementer changes must stay inside the managed worktree and within planner-approved paths/size budgets.

## Decision

- `evaluatePathPolicy` diffs the worktree against a base ref and classifies violations.
- Paths are normalized to posix-relative form; `..` and absolute paths are rejected.
- Realpath checks reject symlink escapes outside the worktree root.
- Default blocked patterns cover `node_modules/**`, `dist/**`, `build/**`, `coverage/**`, `.git/**`, `vendor/**`.
- Any violation sets `requiresHumanApproval: true` (blocks automatic transition).

## Consequences

- Application workflow gates call this before validation/review transitions.
- Nested repos still appear as paths; submodule policy can tighten later.
