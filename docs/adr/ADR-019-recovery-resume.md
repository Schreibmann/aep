# ADR-019 — Recovery and resume after process restart

## Status

Accepted (AEP-022)

## Context

AEP may crash or exit while a Cursor/Fake agent execution is in flight. Architecture requires reattaching with stored `agentId`, reapplying tool allowlists / system prompt / sandbox / cwd / model on `Agent.resume()`, and never marking workflow completion without verified evidence.

## Decision

1. Persist an `ExecutionSnapshot` and `executionLifecycle` (`idle` | `running` | `settled`) with each run before `wait()` returns.
2. On startup / operator request, classify runs:
   - `terminal` — no agent re-entry (`already_terminal`)
   - `safely_resumable` — lifecycle `running` with non-empty opaque agent id
   - `uncertain` — running without a usable agent snapshot; requires `--confirm-uncertain` or `--mark-interrupted`
   - `idle_non_terminal` — waiting on human/gates; `aep resume` is a no-op unless `--mark-interrupted`
3. Uncertain retry policy (v1): with explicit confirmation, mark the run `interrupted` rather than inventing a duplicate agent session. Fresh re-execution needs later approval UX.
4. Resume always passes `sandbox.enabled: true` and the stored role tool policy.
5. Integration coverage uses `FakeAgentRuntime` (optional `holdWait`) and store snapshots to simulate process restart.

## Consequences

- CLI: `aep resume`, `aep recoveries`; doctor reports non-terminal run count.
- Live Cursor `Agent.resume` across process restart remains a later validation matrix item; contracts + Fake path are in place first.
