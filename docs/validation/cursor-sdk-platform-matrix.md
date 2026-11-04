# Cursor SDK / platform validation matrix (AEP-002)

Research / validation date: **2026-11-04** (WSL sandbox PASS update **2026-11-05**)  
Pinned package: `@cursor/sdk@1.3.1` (engines: `node >=22.13`)  
Docs checked: https://cursor.com/docs/sdk/typescript · https://cursor.com/blog/agent-sandboxing  
Host under test: Windows 11 (`win32-x64`) + WSL2 `Ubuntu-24.04`  
Pavan reference pin (AEP-003): tag `v3.8.0` → `8c017953d09f3cec4a32e391b2243a8b01dc5a77` (see ADR-010)

## How to reproduce

```bash
# Offline (default CI-safe)
pnpm validate:sdk:offline
pnpm --filter @aep/runtime-cursor test
pnpm validate:sqlite

# Live / billable on WSL2 Ubuntu (explicit opt-in; key from env or gitignored .env)
# Prefer ~/aep after scripts/wsl/sync-aep-to-home.sh
AEP_LIVE_CURSOR_SDK=1 pnpm validate:sdk:auth
AEP_LIVE_CURSOR_SDK=1 pnpm validate:sdk:live
```

Never print `CURSOR_API_KEY`. Live tests use a disposable git repo under the OS temp directory.

## Results

| Case                                                   | Environment            | Result        | Notes                                                               |
| ------------------------------------------------------ | ---------------------- | ------------- | ------------------------------------------------------------------- |
| SDK package install + pin                              | win32 / Node 26.1.0    | PASS          | `@cursor/sdk@1.3.1` in `@aep/runtime-cursor`                        |
| SDK TypeScript import / declarations                   | win32 / Node 26.1.0    | PASS          | Offline import of `Agent` / `Cursor`                                |
| Node minimum documented                                | docs + package engines | PASS          | `>=22.13` / `22.13.0` floor                                         |
| Platform helper package present                        | win32-x64              | PASS          | `@cursor/sdk-win32-x64@1.3.1` present beside SDK                    |
| `Cursor.models.list()`                                 | live win32             | PASS          | `modelCount=48` (ids not logged)                                    |
| `Agent.create` local handle                            | live win32             | PASS          | `agentId` prefix returned                                           |
| First `agent.send` with `sandboxOptions.enabled: true` | win32 native           | **FAIL**      | Native Windows has no FS sandbox; Cursor runs Linux sandbox in WSL2 |
| `send` / `stream` / `wait` / `cancel` happy path       | win32 native           | FAIL          | Blocked by sandbox unsupported                                      |
| WSL2 Ubuntu sandboxed `agent.send`                     | Ubuntu-24.04 / Node 26 | **PASS**      | After public-hoist of `@cursor/sdk-linux-x64` (see below)           |
| `Agent.resume` across process restart                  | live                   | NOT RUN       | Follow-up once Implementer path needs it                            |
| Reviewer read-only tools (no shell/edit)               | live WSL               | PARTIAL       | validate-live allowlists read/ls; deeper policy cases TBD           |
| Writes outside cwd blocked by sandbox                  | helper preflight WSL   | PASS          | Manual `cursorsandbox` exec OK with outside-cwd policy              |
| Network denied by default in sandbox                   | live                   | NOT RUN       | Policy default; dedicated probe TBD                                 |
| Reads outside workspace not assumed blocked            | docs                   | DOCUMENTED    | Official docs: sandbox bounds writes; reads are not workspace-only  |
| Sandbox missing → fail closed                          | win32 + WSL            | **CONFIRMED** | AEP did **not** retry with sandbox disabled                         |
| Drizzle + `better-sqlite3` smoke                       | win32 / Node 26.1.0    | PASS          | WAL + foreign_keys OK                                               |
| `node:sqlite` experimental driver                      | —                      | DEFERRED      | Do not adopt without ADR-005                                        |

## Live command evidence

### win32 (2026-11-04) — sandbox unsupported

```text
AEP_LIVE_CURSOR_SDK=1 pnpm validate:sdk:auth
→ authStatus=catalog_ok modelCount=48

AEP_LIVE_CURSOR_SDK=1 pnpm validate:sdk:live
→ models.list count=48
→ agent created
→ code=sandbox_unsupported_on_host
→ retriedWithoutSandbox=false
```

### WSL2 Ubuntu-24.04 (2026-11-05) — sandboxed live OK

```text
# after sync + hoist of @cursor/sdk-linux-x64 to node_modules/@cursor/
cd ~/aep && pnpm validate:sdk:live
→ env_file_loaded=true
→ models.list count=48
→ agent created
→ run.status=finished
→ LIVE_VALIDATION_OK
→ retriedWithoutSandbox=false
```

## Sandbox root cause (Cursor blog + SDK 1.3.1 dig)

Per [Implementing a secure sandbox for local agents](https://cursor.com/blog/agent-sandboxing):

- **macOS**: Seatbelt / `sandbox-exec`
- **Linux**: Landlock + seccomp via the `cursorsandbox` helper
- **Windows**: Linux sandbox inside **WSL2** (no native Windows FS sandbox)

SDK fail-closed path (`isSandboxHelperSupported` / preflight) needs the helper binary on disk. Locator (`platform-package-locator` `hQ`) walks from `process.argv[1]` / `process.execPath` looking for:

`node_modules/@cursor/sdk-<platform>-<arch>/bin/cursorsandbox`

With **pnpm**, the optional `@cursor/sdk-linux-x64` package lives only under `.pnpm/.../node_modules/@cursor/`, so the walk returns empty → `ConfigurationError` even when the binary exists and manual preflight succeeds.

Mitigations in this repo:

1. Root `.npmrc`: `public-hoist-pattern[]=@cursor/sdk-*`
2. `scripts/wsl/hoist-sdk-linux-x64.sh` (also invoked from `sync-aep-to-home.sh`)
3. Probe: `scripts/wsl/probe-hq-locator.mjs`

Policy files are written under `~/.cursor/sandbox-policies` (or `CURSOR_SANDBOX_POLICY_DIR`), not under the agent cwd — so cwd Landlock does not delete the policy mid-preflight when the path is outside the workspace.

## Security decisions recorded

1. Local sessions MUST set `local.sandboxOptions.enabled: true`.
2. If sandbox helper/`ConfigurationError` occurs, stop. Do **not** disable sandbox.
3. **Windows native is not a verified sandboxed execution host** for AEP local agents.
4. **Verified secure target on this machine: WSL2 Ubuntu-24.04** with hoisted `@cursor/sdk-linux-x64`.
5. Auto-review is optional best-effort only; not a security boundary.
6. Live SDK validation is opt-in via `AEP_LIVE_CURSOR_SDK=1` and never required by PR CI.

## Blockers for implementer workflow

- win32 native sandboxed local agents remain blocked (by design of Cursor sandbox).
- WSL2 Ubuntu is the documented sandboxed host for this maintainer machine.
- Keep fail-closed behavior; do not disable sandbox to “unblock” Windows.

## Credential handling

- API key used from gitignored `.env` only.
- No API keys were written to tracked files.
- `.env.example` has no secret values.
