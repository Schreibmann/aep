# ADR-004: OS / security execution strategy

- Status: Accepted (with live Windows sandbox proof still pending)
- Date: 2026-11-04
- Task: AEP-003

## Decision

Every local Cursor agent session MUST use `local.sandboxOptions.enabled: true`. If the sandbox helper is unavailable or `ConfigurationError` occurs, AEP fails closed. Do not retry with sandbox disabled.

On this maintainer machine, offline checks confirmed `@cursor/sdk-win32-x64` is installed, but a live sandboxed session was not run (no API key during AEP-002). Until live proof exists on Windows native, **WSL2/Linux** is the documented secure fallback host.

## Consequences

- Implementer workflow remains gated on verified sandboxed execution.
- Worker processes use a minimized environment; do not expose personal credentials via HOME/env.
- Auto-review is optional and never a security boundary.
