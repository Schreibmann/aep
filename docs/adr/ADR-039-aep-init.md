# ADR-039 — `aep init` interactive setup

## Status

Accepted (AEP-061)

## Context

Init must create `.aep/config.yaml` from detection, require approval for ambiguous gates, and never overwrite AGENTS.md / CLAUDE.md / Cursor rules or write secrets.

## Decision

- `detectStack` → `buildProjectConfigFromDetection` → YAML write with `wx`.
- Exact high-confidence scripts may auto-approve; ambiguous scripts go to `gates.pendingConfirmation`.
- CLI: `aep init [--approve-gate <name>] [--no-auto-approve-exact]`.
- Idempotent: existing config refuses overwrite.

## Consequences

- AEP-062 profile consumes approvedScriptNames only.
