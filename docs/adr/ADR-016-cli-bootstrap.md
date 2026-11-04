# ADR-016: CLI bootstrap with application DI

- Status: Accepted
- Date: 2026-11-05
- Task: AEP-013

## Decision

Ship `apps/cli` (`@aep/cli`) on Commander and `packages/application` for use-cases. The CLI depends on `@aep/application` only. Default `createApp()` injects `FakeAgentRuntime` from `@aep/runtime-contracts`. The CLI MUST NOT import `@aep/runtime-cursor` / `@cursor/sdk`.

Skeleton commands: `aep --help`, `aep --version`, `aep doctor`, `aep init`, `aep run`, `aep status`, with optional `--json`.

## Consequences

- Cursor live wiring is a later DI swap inside application composition, not a CLI import.
- Run state is in-memory until AEP-020 persistence.
- `aep init` creates `.aep/config.yaml` and refuses overwrite.
