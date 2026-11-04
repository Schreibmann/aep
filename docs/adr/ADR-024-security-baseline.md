# ADR-024 — Security baseline

## Status

Accepted (AEP-034)

## Context

Local Cursor agents need sandbox, minimal env, role tool allowlists, and credential hygiene before AEP-040 wires the live SDK adapter.

## Decision

- Package `@aep/security` owns:
  - `buildIsolatedAgentEnv` (temp HOME, blocked credential env keys)
  - role tool policies (planner/reviewer read-only; implementer read/edit/shell; no mcp/task)
  - `requireEnabledSandbox` / `assertSandboxReady` (fail closed)
  - `SecureCredentialSource` for SDK options only (never prompts/worktree/env allowlist)
- Secret canaries in logs/streams must be redacted; leaks throw `secret_leak`.

## Consequences

- `CursorAgentRuntime` (AEP-040) MUST consume these helpers for every session.
- Unsupported sandbox hosts block the run; WSL2/Linux remains the supported path when native sandbox fails.
