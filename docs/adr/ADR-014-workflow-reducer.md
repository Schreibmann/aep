# ADR-014: Deterministic workflow reducer

- Status: Accepted
- Date: 2026-11-05
- Task: AEP-011

## Decision

Workflow state transitions live in `@aep/domain` as a pure `reduceWorkflow(state, event)` function. Application services map provider/SDK outcomes into a closed `WorkflowEvent` union; models never emit arbitrary transitions.

## Rules enforced

- Valid status transition table from architecture §9.
- Terminal statuses (`completed` / `failed` / `cancelled` / `blocked` / `interrupted`) reject further events.
- `completed` requires evidence: plan approval, gates passed, review approval, scope check.
- `maxFixCycles` (default 2), per-role `maxRoleExecutions`, and `maxParallelWriters` (default 1) are enforced in the reducer.
- Budget/policy violations move the run to `blocked` without disabling sandbox elsewhere.

## Consequences

- Orchestrator code applies events after side effects; it does not invent status strings.
- FakeAgentRuntime (AEP-012) will feed normalized events only.
- Exhaustive status×event tests live in `packages/domain/tests/workflow-reducer.test.ts`.
