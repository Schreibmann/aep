# ADR-043 — Dashboard skeleton

## Status

Accepted (AEP-071)

## Context

Operators need a local React UI for projects, runs, settings, models, and approvals after the CLI MVP.

## Decision

- Add `apps/dashboard` (React + Vite).
- Talk only to the authenticated local API; never open SQLite.
- Pages: Projects, Runs, Approvals, Models, Settings (plus timeline/economy in follow-ons).

## Consequences

- Vite proxies `/api` to `127.0.0.1:7432` in dev.
- Token stored in localStorage for local use only.
