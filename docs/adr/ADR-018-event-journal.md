# ADR-018: Event journal and projections

- Status: Accepted
- Date: 2026-11-05
- Task: AEP-021

## Decision

`@aep/persistence` owns the append-only `workflow_events` journal. Each append runs in one SQLite transaction that:

1. Rejects duplicate event IDs idempotently (`duplicate` result).
2. Rebuilds the domain aggregate from prior journal rows.
3. Applies `reduceWorkflow` for the new event.
4. Writes the event (versioned payload + UTC `created_at` + `actor` + `operation_origin`).
5. Updates the `workflow_runs` projection (and gate evidence rows when applicable).

Queries: `listRunTimeline`, `listTasks`, `listEvidence`. `replayWorkflowRun` rebuilds the projection from the journal for recovery checks.

## Consequences

- Domain reducer remains the only state-transition authority.
- Cursor SDK session store stays separate.
- Application services map provider outcomes into `WorkflowEvent` before journaling.
