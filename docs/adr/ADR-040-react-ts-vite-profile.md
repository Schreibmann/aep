# ADR-040 — React/TypeScript/Vite project profile

## Status

Accepted (AEP-062)

## Context

Projects need configurable quality gates and a reviewer checklist without imposing Redux, FSD, a router, or a specific test runner. Only human-approved scripts may run as gates.

## Decision

- Add `resolveReactTsViteProfile` in `@aep/project-profiles` over stack detection + `.aep/config.yaml`.
- `createGatesFromProjectProfile` accepts `approvedScriptNames`; unapproved scripts never become argv.
- Versioned checklist data selects items by detected frameworks only.
- Fixtures: single Vite React TS app and a pnpm monorepo.

## Consequences

- `runGatesForRun` loads config approvals when present.
- Reviewer prompt appends the selected checklist text.
