# ADR-020 — Repository inspector

## Status

Accepted (AEP-030)

## Context

AEP must inspect Git state before creating worktrees or running agents. It must never mutate the caller's dirty working tree.

## Decision

- Package `@aep/git-workspaces` owns repository inspection.
- All Git calls use `spawnSync("git", argv, { shell: false })` (no shell interpolation).
- Inspection reports: root, common dir, HEAD, branch/detached, dirty entries, remotes, worktrees, lockfiles, project files/scripts, symlinks, submodules.
- Non-Git paths raise `GitWorkspacesError` with code `not_a_git_repository` and an actionable message.

## Consequences

- AEP-031 worktree manager builds on this inspector.
- AEP-032 will extract a general safe command runner; Git inspection keeps using argv-only Git until then.
