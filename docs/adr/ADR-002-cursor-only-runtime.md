# ADR-002: Minimal AgentRuntime boundary; Cursor-only v1

- Status: Accepted
- Date: 2026-11-04
- Task: AEP-003

## Decision

v1 implements a single AI execution runtime: Cursor TypeScript Agent SDK (`@cursor/sdk`), isolated in `@aep/runtime-cursor`. Domain/application packages MUST NOT import the SDK. A minimal `AgentRuntime` interface may exist later for isolation, but no plugin marketplace and no second provider adapters in v1.

## Consequences

- No Claude Agent SDK, Codex, OpenAI API, Gemini API, or OMP as runtime dependencies.
- Adding another runtime requires maintainer approval, ADR, and measured need (AEP-093 research only until then).
- FakeAgentRuntime is the default test double for CI.
