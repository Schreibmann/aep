# ADR-032 — Human approval service

## Status

Accepted (AEP-052)

## Context

Architecture §12.3 requires human approval before writes, out-of-scope changes, network, extra model charges, and budget continuation. Approvals must bind to a specific plan/diff hash so a later mutation cannot reuse an earlier decision. Non-interactive CLI must not silently proceed.

## Decision

- Extend `@aep/policy` with `hashApprovalSubject`, `PendingApproval`, and `checkSubjectHashUnchanged`.
- After a validated plan, `runTask` stores `pendingApproval` with kind `plan` and the plan subject hash (unless policy already blocked the run).
- `decidePlanApproval` verifies status, pending kind, and hash equality; records approver/timestamp/decision/scope/rationale; emits `plan_approved` or `plan_rejected`.
- CLI `aep approve <run-id> --approve|--reject` requires an explicit flag in non-interactive mode (`approval_required` otherwise).
- Approving when policy `allowAgentWriteExecution` is false is rejected (`policy_denies_write`).

## Consequences

- Later subjects (network, budget, out-of-scope) reuse the same binding helpers.
- Dashboard can render pending approvals from `StoredRun.pendingApproval`.
