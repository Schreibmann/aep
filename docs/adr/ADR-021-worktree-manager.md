# ADR-021 — Worktree manager

## Status

Accepted (AEP-031); supersedes pending ADR-008 outline for lifecycle basics.

## Context

Agents must never write in the caller's main working tree. AEP creates isolated Git worktrees from an immutable base SHA.

## Decision

- Branch scheme: `aep/<task-id>/<run-id>` (sanitized segments).
- `createManagedWorktree` uses `git worktree add -b <branch> <path> <baseSha>` (argv-only).
- Metadata stored in `WorktreeMetadataStore` (in-memory for now).
- Validate worktree `commonDir` matches the source repository.
- Retain worktrees by default; `removeManagedWorktree` requires `confirm: true` and refuses dirty trees unless `allowDirty: true`.
- Duplicate task/run creation fails with `worktree_collision`.

## Consequences

- Path/diff policy (AEP-033) can assume worktree paths are validated against common dir.
- Durable metadata in SQLite can replace the in-memory store later.
