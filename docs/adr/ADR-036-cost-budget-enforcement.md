# ADR-036 — Cost policy and budget enforcement

## Status

Accepted (AEP-056)

## Context

Architecture requires per-run/role execution limits, token thresholds, unknown-cost handling, no unapproved paid model fallback, and truthful costStatus persistence. Hard dollar caps for active local runs must not be claimed without provider-reported amounts.

## Decision

- Extend `@aep/model-routing` with `RunBudgetPolicy`, `authorizeRoleStart`, `recordRoleStart`, `reconcileUsage`.
- Default `onUnknownCost: require_approval` sets `blockedForApproval` so the _next_ role cannot start until cleared; it does not rewrite the current workflow status by itself.
- `allowPotentialExtraCharge` on `CostPolicy` remains false by default; unpaid `extra_spend_possible` models stay rejected unless allowlisted.
- `runTask` records budget state and persists `costStatus` via the existing usage ledger.

## Consequences

- Implementer/Reviewer/fix-cycle callers should use `beginRoleUnderBudget` before starting.
- Human approval of type `budget_continuation` (AEP-052) can clear the block via `clearBudgetApprovalBlock`.
