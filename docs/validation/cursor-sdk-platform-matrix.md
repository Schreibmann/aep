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

# Live / billable (explicit opt-in; key from env or gitignored .env)
AEP_LIVE_CURSOR_SDK=1 pnpm validate:sdk:auth
AEP_LIVE_CURSOR_SDK=1 pnpm validate:sdk:live
```

Never print `CURSOR_API_KEY`. Live tests use a disposable git repo under the OS temp directory.

## Results

| Case                                                   | Environment            | Result        | Notes                                                              |
| ------------------------------------------------------ | ---------------------- | ------------- | ------------------------------------------------------------------ |
| SDK package install + pin                              | win32 / Node 26.1.0    | PASS          | `@cursor/sdk@1.3.1` in `@aep/runtime-cursor`                       |
| SDK TypeScript import / declarations                   | win32 / Node 26.1.0    | PASS          | Offline import of `Agent` / `Cursor`                               |
| Node minimum documented                                | docs + package engines | PASS          | `>=22.13` / `22.13.0` floor                                        |
| Platform helper package present                        | win32-x64              | PASS          | `@cursor/sdk-win32-x64@1.3.1` present beside SDK                   |
| `Cursor.models.list()`                                 | live win32             | PASS          | `modelCount=48` (ids not logged)                                   |
| `Agent.create` local handle                            | live win32             | PASS          | `agentId` prefix returned                                          |
| First `agent.send` with `sandboxOptions.enabled: true` | win32 native           | **FAIL**      | `ConfigurationError`: sandboxing not supported in this environment |
| `send` / `stream` / `wait` / `cancel` happy path       | win32 native           | FAIL          | Blocked by sandbox unsupported                                     |
| `Agent.resume` across process restart                  | live                   | NOT RUN       | Depends on sandboxed host                                          |
| Reviewer read-only tools (no shell/edit)               | live                   | NOT RUN       | Script configures allowlist; needs sandboxed host                  |
| Writes outside cwd blocked by sandbox                  | live                   | NOT RUN       | Needs sandboxed host                                               |
| Network denied by default in sandbox                   | live                   | NOT RUN       | Needs sandboxed host                                               |
| Reads outside workspace not assumed blocked            | docs                   | DOCUMENTED    | Official docs: sandbox bounds writes; reads are not workspace-only |
| Sandbox missing → fail closed                          | win32 live             | **CONFIRMED** | AEP did **not** retry with sandbox disabled                        |
| Ubuntu / Linux sandbox (bubblewrap)                    | WSL2 Ubuntu-24.04      | PARTIAL       | `bwrap` works; Cursor helper/SDK still reports unsupported         |
| WSL2 Ubuntu sandbox live `agent.send`                  | Ubuntu-24.04 / Node 26 | **FAIL**      | `sandbox_unsupported_on_host` despite landlock LSM + linux helper  |
| Drizzle + `better-sqlite3` smoke                       | win32 / Node 26.1.0    | PASS          | WAL + foreign_keys OK                                              |
| `node:sqlite` experimental driver                      | —                      | DEFERRED      | Do not adopt without ADR-005                                       |

## Live command evidence (2026-11-04)

```text
AEP_LIVE_CURSOR_SDK=1 pnpm validate:sdk:auth
→ authStatus=catalog_ok modelCount=48

AEP_LIVE_CURSOR_SDK=1 pnpm validate:sdk:live
→ models.list count=48
→ agent created
→ code=sandbox_unsupported_on_host
→ retriedWithoutSandbox=false
```

## Security decisions recorded

1. Local sessions MUST set `local.sandboxOptions.enabled: true`.
2. If sandbox helper/`ConfigurationError` occurs, stop. Do **not** disable sandbox.
3. **Windows native is not a verified sandboxed execution host** for AEP local agents on this machine.
4. Supported secure target until proven otherwise: **WSL2 Ubuntu/Linux** (or other approved Linux host with working helper).
5. Auto-review is optional best-effort only; not a security boundary.
6. Live SDK validation is opt-in via `AEP_LIVE_CURSOR_SDK=1` and never required by PR CI.

## Blockers for implementer workflow

Until at least one sandboxed live local session succeeds on WSL2/Linux (or a future verified Windows sandbox):

- Do not mark AEP-002 live sandbox acceptance as complete.
- Do not proceed to writing Implementer flows that assume a verified sandbox host.
- Auth/catalog are unblocked; sandboxed execution remains gated.

## Credential handling

- API key used from gitignored `.env` only.
- No API keys were written to tracked files.
- `.env.example` has no secret values.
