# ADR-025 — CursorAgentRuntime

## Status

Accepted (AEP-040)

## Context

AEP needs a production `AgentRuntime` that wraps `@cursor/sdk` without leaking SDK types into domain/application packages.

## Decision

- Implement `CursorAgentRuntime` in `@aep/runtime-cursor`.
- Isolate SDK I/O behind `CursorSdkBridge` (`LiveCursorSdkBridge` + `StubCursorSdkBridge`).
- Require `sandboxOptions.enabled: true` via `@aep/security` before create/resume.
- Pass API keys only from `SecureCredentialSource` into SDK options.
- Dispose each SDK agent on success/error/cancel completion of `wait()`.
- Contract tests use the stub bridge (no live network / no billable runs).

## Consequences

- AEP-041 deepens stream normalization and cancellation wiring.
- AEP-042/044 expand catalog TTL and usage metering on the same runtime.
