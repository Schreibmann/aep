# ADR-004: OS / security execution strategy

- Status: Accepted — **Windows native sandbox unsupported; WSL2/Linux required**
- Date: 2026-11-04
- Task: AEP-003 / live re-check AEP-004-live

## Decision

Every local Cursor agent session MUST use `local.sandboxOptions.enabled: true`. If the sandbox helper is unavailable or `ConfigurationError` occurs, AEP fails closed. Do not retry with sandbox disabled.

### Live evidence (this maintainer machine)

- Offline: `@cursor/sdk-win32-x64` present.
- Live auth/catalog: PASS (`modelCount=48`).
- Live sandboxed run on **win32 native**: FAIL with SDK message that sandboxing is not supported in this environment.
- AEP did not disable sandbox to continue.
- WSL currently only exposes `docker-desktop` (Stopped); a proper Ubuntu/Linux WSL2 (or other Linux) environment is required for sandboxed agent execution.

## Consequences

- Implementer workflow remains gated on a verified sandboxed Linux/WSL2 host.
- Documented local path: `docs/development/wsl2-validation.md`.
- Worker processes use a minimized environment; do not expose personal credentials via HOME/env.
- Auto-review is optional and never a security boundary.
