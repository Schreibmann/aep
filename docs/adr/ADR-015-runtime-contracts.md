# ADR-015: runtime-contracts and FakeAgentRuntime

- Status: Accepted
- Date: 2026-11-05
- Task: AEP-012

## Decision

Introduce `@aep/runtime-contracts` with a minimal `AgentRuntime` interface (`id: "cursor" | "fake"`) and normalized execution/event/usage types from architecture §§7–8. Ship `FakeAgentRuntime` in the same package for CI and application tests.

`@aep/runtime-cursor` remains the only production adapter and the only package allowed to import `@cursor/sdk`. Domain/application depend on contracts + fake, never on the SDK.

## Consequences

- No provider registry or empty adapters.
- Fake can script streams, failures, cancellation, resume, `unknown` usage, and `feature_unavailable` cost responses.
- Cursor adapter (later tasks) must map SDK events into the same `AgentEvent` / `UsageResult` shapes.
