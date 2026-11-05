# ADR-037 — End-to-end MVP scenario

## Status

Accepted (AEP-057)

## Context

Roadmap P5.8 requires a full fake-runtime scenario: disposable project, plan/approve, worktree, implement, gates, review, one fix cycle, usage provenance, main tree unchanged, no commit/push/merge/deploy by AEP.

## Decision

- Add `prepareWorkspace` (git worktree via `@aep/git-workspaces`) and `runImplementer`.
- Cover the scenario with `packages/application/tests/e2e-mvp.test.ts` using `FakeAgentRuntime` scripts.
- Default budget `onUnknownCost: continue` so unknown fake usage does not halt the MVP path; stricter modes remain unit-tested.
- No automatic git commit/push/merge/deploy.

## Consequences

- Opt-in live Cursor E2E remains separate (`validate:sdk:live`).
- CI runs the fake scenario as part of `@aep/application` tests.
