# ADR-004: OS / security execution strategy

- Status: Accepted — **sandbox unsupported on win32 and current WSL2 Ubuntu; fail closed**
- Date: 2026-11-04
- Task: AEP-003 / AEP-004-live / WSL Ubuntu bootstrap

## Decision

Every local Cursor agent session MUST use `local.sandboxOptions.enabled: true`. If the sandbox helper is unavailable or `ConfigurationError` occurs, AEP fails closed. Do not retry with sandbox disabled.

### Live evidence (this maintainer machine)

- Offline: `@cursor/sdk-win32-x64` and `@cursor/sdk-linux-x64` present on respective hosts.
- Live auth/catalog: PASS (`modelCount=48`) on win32 and WSL2 Ubuntu.
- Live sandboxed run on **win32 native**: FAIL (`sandbox_unsupported_on_host`).
- **Ubuntu-24.04 WSL2** installed and bootstrapped (Node 26.13, pnpm 10.20, bubblewrap, securityfs/landlock visible).
- Live sandboxed run on **WSL2 Ubuntu**: still FAIL with the same SDK `ConfigurationError` / `sandbox_unsupported_on_host`.
- AEP did not disable sandbox to continue on either host.

## Consequences

- Implementer workflow remains gated until a host proves sandboxed Cursor local sessions.
- WSL2 Ubuntu is the preferred Windows-side development environment for AEP toolchain/auth, but is **not yet** a verified Cursor sandbox host.
- Next investigation: Cursor sandbox backend requirements beyond bubblewrap/landlock, or a native Linux VM/host.
- Documented local path: `docs/development/wsl2-validation.md`.
- Worker processes use a minimized environment; do not expose personal credentials via HOME/env.
- Auto-review is optional and never a security boundary.
