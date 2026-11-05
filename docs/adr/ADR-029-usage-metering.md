# ADR-029 — Usage metering and provider diagnostics

## Status

Accepted (AEP-044)

## Context

Token counts may arrive from `run.usage` / `agent.getUsage()` while dollar settlement can be delayed or `feature_unavailable`. CLI operators need `aep auth status`, `aep models`, and expanded `aep doctor` without leaking secrets.

## Decision

- Record `UsageResult` per role execution in an in-memory `InMemoryUsageLedger` (SQLite projection later).
- `formatUsageDisplay` never renders unknown cost as `$0`; only `provider_reported` billed amounts appear.
- `feature_unavailable` is a supported capability gap, not a crash.
- `redactProviderError` strips API key / bearer patterns before surfacing errors.
- Billing owner (user plan vs team service account) remains `unknown` until provider metadata exists.
- CLI: `aep auth status`, `aep models`; doctor adds auth, usage metering, and ledger checks.

## Consequences

- Persistence schema already has `usage_records`; application ledger is the immediate source of truth for Fake/local runs.
- Live Cursor settlement refresh can update ledger entries later without rewriting token history.
