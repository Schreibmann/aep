# ADR-045 — Economy dashboard

## Status

Accepted (AEP-073)

## Context

Usage must show tokens, provider-reported billed amounts, plan-included usage, and unknown costs separately. Token→dollar estimation without a rate snapshot is forbidden.

## Decision

- Aggregate ledger entries into explicit categories in the dashboard.
- Estimated cost bucket always states rate-snapshot requirement.
- Provider billed USD is summed only when `costStatus=provider_reported`.

## Consequences

- Economy UI never fabricates `$0` for unknown or plan-included usage.
