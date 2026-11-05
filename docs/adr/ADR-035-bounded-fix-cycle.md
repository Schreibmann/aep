# ADR-035 — Bounded fix cycle

## Status

Accepted (AEP-055)

## Context

Architecture requires mapping blocking review findings into a scoped Implementer prompt, enforcing `maxFixCycles` (default 2), re-running gates and Reviewer after each fix, and stopping on repeated findings, scope expansion, or budget/unclear requirements.

## Decision

- Add Implementer profile + `buildFixPromptFromFindings` / `detectRepeatedFindings` in `@aep/agent-profiles`.
- `runBoundedFixCycle` emits `fix_cycle_started`, runs Implementer, checks changed paths against approved plan (`findOutOfScopePaths`), re-runs fast gates, then Reviewer.
- Stop reasons: `approved`, `max_fix_cycles`, `repeated_findings`, `scope_expansion`, `gates_failed`, `unclear_requirements`.
- Final report lists fixed/unfixed finding ids and rationale.

## Consequences

- Out-of-scope files never auto-continue; they require AEP-052 approval (later wiring).
- Cost budget stops (AEP-056) can add `budget_threshold` as another stop reason.
