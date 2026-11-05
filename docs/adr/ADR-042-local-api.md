# ADR-042 — Authenticated loopback local API

## Status

Accepted (AEP-070)

## Context

Dashboard and local tools need runs, status, events, approvals, models, usage, and worktrees without opening a LAN service by default.

## Decision

- `apps/api` serves JSON over Node `http`, default bind `127.0.0.1:7432`.
- Bearer token auth (`AEP_API_TOKEN` / generated); SHA-256 compare with timing-safe equality.
- Non-loopback bind requires `--allow-lan` and still requires auth (including `/health`).
- Timeline events are projected from stored run state with secret redaction; no hidden reasoning.
- Approvals mutate state only via `decidePlanApproval`.

## Consequences

- Dashboard (AEP-071+) is a pure API client; no SQLite access.
- CLI can start the same server later via a serve command.
