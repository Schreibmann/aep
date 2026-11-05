# ADR-044 — Live run timeline

## Status

Accepted (AEP-072)

## Context

Operators need stage/role, gate, review, and approval visibility without chain-of-thought or secrets.

## Decision

- Dashboard polls `GET /runs/:id/events`.
- Events are API-projected safe text (role stage, gates, findings, approvals, worktree, budget).
- No hidden reasoning fields are rendered.

## Consequences

- Polling interval is 2.5s in the dashboard; SSE can replace later without schema change.
