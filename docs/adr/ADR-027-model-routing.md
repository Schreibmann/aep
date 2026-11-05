# ADR-027 — Model catalog cache and role selection

## Status

Accepted (AEP-042)

## Context

AEP must pick models only from the connected account's `Cursor.models.list()` catalog. Hardcoded vendor IDs (`composer-*`, Claude/GPT/Gemini families, `auto-smart` as a universal default) are forbidden. Extra-spend options need explicit approval (ADR-011).

## Decision

- Add `@aep/model-routing` (SDK-free) with:
  - `ModelCatalogCache` (TTL refresh)
  - `resolveModelForRole` (allowlist + cost policy + role preferences)
  - `listOptimizeForValues` for account-exposed `optimize_for` params only
- Extend `ModelCatalogSnapshot` with `snapshotId` and optional parameter/variant metadata.
- Pass `modelParams` / `catalogSnapshotId` on execution inputs; Cursor bridge forwards params to SDK `ModelSelection`.
- Missing / unapproved models fail closed (`ModelRoutingError`) — never silent substitution.

## Consequences

- Application/workflow layers record `catalogSnapshotId`, selected model id/params, and rationale.
- Live billing category remains `unknown` until a proven signal exists; cost gate uses explicit annotations + allowlists.
