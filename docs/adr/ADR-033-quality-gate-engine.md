# ADR-033 — Quality Gate Engine

## Status

Accepted (AEP-053)

## Context

Architecture §13 requires gates as exact argv commands from a trusted project profile, executed via Safe Command Runner. Model text must never become shell/argv. Failed mandatory gates block completion; evidence (stdout/stderr tail, exit code, duration, command identity) must be available to the Reviewer.

## Decision

- Add `@aep/quality-gates` with `createGatesFromProjectProfile` mapping only known `package.json` script _names_ to `pnpm|npm|yarn run <name>`.
- Script bodies are never parsed into argv.
- `runQualityGates` executes via injectable `GateCommandRunner` (production: `SafeCommandRunner` + trusted registry).
- Fast gates run before full (`build`) when phase is `all`.
- Application `runGatesForRun` persists `GateEngineResult` on `StoredRun.gateResults`; workflow `gate_*` events apply only in `validating` / `final_validation`.

## Consequences

- Plan `gates[].commandHint` is advisory for humans/Reviewer, not an execution source.
- AEP-054 Reviewer can consume `gateResults` evidence without re-running commands.
