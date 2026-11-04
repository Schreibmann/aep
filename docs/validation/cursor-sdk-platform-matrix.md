# Cursor SDK / platform validation matrix (AEP-002)

Research / validation date: **2026-11-04**  
Pinned package: `@cursor/sdk@1.3.1` (engines: `node >=22.13`)  
Docs checked: https://cursor.com/docs/sdk/typescript  
Host under test: Windows 11 (`win32-x64`), Node `26.1.0`  
Pavan reference pin (AEP-003): tag `v3.8.0` → `8c017953d09f3cec4a32e391b2243a8b01dc5a77` (see ADR-010)

## How to reproduce

```bash
# Offline (default CI-safe)
pnpm validate:sdk:offline
pnpm --filter @aep/runtime-cursor test
pnpm validate:sqlite

# Live / billable (explicit opt-in only)
# AEP_LIVE_CURSOR_SDK=1 CURSOR_API_KEY=… pnpm validate:sdk:live
```

Never print `CURSOR_API_KEY`. Live tests use a disposable git repo under the OS temp directory.

## Results

| Case                                                  | Environment            | Result       | Notes                                                              |
| ----------------------------------------------------- | ---------------------- | ------------ | ------------------------------------------------------------------ |
| SDK package install + pin                             | win32 / Node 26.1.0    | PASS         | `@cursor/sdk@1.3.1` in `@aep/runtime-cursor`                       |
| SDK TypeScript import / declarations                  | win32 / Node 26.1.0    | PASS         | Offline import of `Agent` / `Cursor`                               |
| Node minimum documented                               | docs + package engines | PASS         | `>=22.13` / `22.13.0` floor                                        |
| Platform helper package present                       | win32-x64              | PASS         | `@cursor/sdk-win32-x64@1.3.1` present beside SDK in pnpm store     |
| `Cursor.models.list()`                                | live                   | BLOCKED      | `CURSOR_API_KEY` unset during AEP-002                              |
| `Agent.create` local + `sandboxOptions.enabled: true` | win32 native           | BLOCKED      | Needs live opt-in + key                                            |
| `send` / `stream` / `wait` / `cancel`                 | live                   | BLOCKED      | Needs live opt-in + key                                            |
| `Agent.resume` across process restart                 | live                   | BLOCKED      | Needs live opt-in + key                                            |
| Reviewer read-only tools (no shell/edit)              | live                   | BLOCKED      | Script configures allowlist; needs live proof                      |
| Writes outside cwd blocked by sandbox                 | live                   | BLOCKED      | Needs live opt-in + key                                            |
| Network denied by default in sandbox                  | live                   | BLOCKED      | Needs live opt-in + key                                            |
| Reads outside workspace not assumed blocked           | docs                   | DOCUMENTED   | Official docs: sandbox bounds writes; reads are not workspace-only |
| Sandbox missing → fail closed                         | policy                 | ACCEPTED     | AEP must not retry with sandbox disabled                           |
| Ubuntu / Linux sandbox (bubblewrap)                   | CI / WSL2              | NOT RUN HERE | Use WSL2 path in `docs/development/wsl2-validation.md`             |
| WSL2 Ubuntu sandbox                                   | local                  | NOT RUN HERE | Required fallback if Windows native sandbox fails                  |
| Drizzle + `better-sqlite3` smoke                      | win32 / Node 26.1.0    | PASS         | WAL + foreign_keys OK; preferred AEP DB driver                     |
| `node:sqlite` experimental driver                     | —                      | DEFERRED     | Do not adopt without ADR-005                                       |

## Offline command evidence (2026-11-04)

```text
pnpm validate:sdk:offline → 8/8 passed
pnpm validate:sqlite → {"ok":true,"driver":"better-sqlite3",...}
pnpm test → root 2 passed; @aep/runtime-cursor 3 passed
```

## Security decisions recorded

1. Local sessions MUST set `local.sandboxOptions.enabled: true`.
2. If sandbox helper/`ConfigurationError` occurs, stop. Do **not** disable sandbox.
3. If Windows native sandbox cannot be proven live, supported secure target is **WSL2/Linux**.
4. Auto-review is optional best-effort only; not a security boundary.
5. Live SDK validation is opt-in via `AEP_LIVE_CURSOR_SDK=1` and never required by PR CI.

## Blockers for implementer workflow

Until at least one sandboxed live local session succeeds on a supported OS:

- Do not mark AEP-002 live sandbox acceptance as complete.
- Do not proceed to writing Implementer flows that assume a verified sandbox host.
- Offline pin/import/SQLite work may continue; live Cursor adapter integration remains gated on credentials + sandbox proof.

## Credential handling

- No API keys were written to tracked files.
- `.env` remains gitignored; `.env.example` has no secret values.
