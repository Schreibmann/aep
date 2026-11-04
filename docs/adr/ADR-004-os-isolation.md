# ADR-004: OS / security execution strategy

- Status: Accepted — **win32 unsupported; WSL2 Ubuntu verified sandboxed host; fail closed**
- Date: 2026-11-04 (updated 2026-11-05)
- Task: AEP-003 / AEP-004-live / WSL Ubuntu bootstrap

## Decision

Every local Cursor agent session MUST use `local.sandboxOptions.enabled: true`. If the sandbox helper is unavailable or `ConfigurationError` occurs, AEP fails closed. Do not retry with sandbox disabled.

Execution host for this maintainer machine: **WSL2 Ubuntu-24.04** (Cursor’s Windows path uses a Linux sandbox in WSL2 — see [agent sandboxing](https://cursor.com/blog/agent-sandboxing)).

### Live evidence (this maintainer machine)

- Offline: `@cursor/sdk-win32-x64` and `@cursor/sdk-linux-x64` present on respective hosts.
- Live auth/catalog: PASS (`modelCount=48`) on win32 and WSL2 Ubuntu.
- Live sandboxed run on **win32 native**: FAIL (`sandbox_unsupported_on_host`) — expected.
- **Ubuntu-24.04 WSL2** bootstrapped (Node 26.13, pnpm 10.20, landlock visible).
- Live sandboxed run on **WSL2 Ubuntu**: **PASS** (`LIVE_VALIDATION_OK`) after making `@cursor/sdk-linux-x64` discoverable via public hoist / `hoist-sdk-linux-x64.sh`.
- Earlier false negative: helper binary existed under `.pnpm/` but SDK locator never saw it; manual `cursorsandbox` preflight already succeeded.
- AEP did not disable sandbox to continue on either host.

## Consequences

- Implementer local sessions should run under WSL2 Ubuntu (or another Linux host with a discoverable `cursorsandbox`).
- Keep `.npmrc` public-hoist for `@cursor/sdk-*` so pnpm does not hide the platform binary.
- Documented local path: `docs/development/wsl2-validation.md`.
- Worker processes use a minimized environment; do not expose personal credentials via HOME/env.
- Auto-review is optional and never a security boundary.
