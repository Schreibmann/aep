# WSL2 validation path

AEP local agent sessions require Cursor SDK `local.sandboxOptions.enabled: true`. CI on GitHub-hosted runners cannot fully prove sandbox helper behavior on a developer machine.

Cursor’s own design ([agent sandboxing](https://cursor.com/blog/agent-sandboxing)): Windows agents use the **Linux** sandbox inside WSL2. Native win32 has no FS sandbox.

## Current maintainer setup (2026-11-05)

| Item           | Value                                                            |
| -------------- | ---------------------------------------------------------------- |
| Distro         | `Ubuntu-24.04` (WSL2), default                                   |
| User           | `heptapod`                                                       |
| Node           | `v26.13.0`                                                       |
| pnpm           | `10.20.0`                                                        |
| Extra packages | `build-essential`, `git`, `curl`, `bubblewrap`, `rsync`          |
| Working copy   | `/home/heptapod/aep` (Linux FS sync from `C:\WORK\MY\aep`)       |
| Secrets        | `.env` copied into `~/aep` (mode 600); never committed           |
| `wsl.conf`     | `appendWindowsPath=false`, systemd enabled                       |
| securityfs     | mounted at `/sys/kernel/security` (landlock visible in LSM list) |
| Platform bin   | `@cursor/sdk-linux-x64` public-hoisted / `hoist-sdk-linux-x64.sh` |

Bootstrap scripts (from Windows repo):

```bash
# inside Ubuntu
bash /mnt/c/WORK/MY/aep/scripts/wsl/bootstrap-ubuntu-user.sh heptapod
bash /mnt/c/WORK/MY/aep/scripts/wsl/bootstrap-toolchain.sh
bash /mnt/c/WORK/MY/aep/scripts/wsl/configure-wsl-conf.sh
bash /mnt/c/WORK/MY/aep/scripts/wsl/mount-securityfs.sh
bash /mnt/c/WORK/MY/aep/scripts/wsl/sync-aep-to-home.sh
```

Then:

```bash
wsl -d Ubuntu-24.04 -u heptapod -- bash -lc 'cd ~/aep && pnpm validate:sdk:auth'
wsl -d Ubuntu-24.04 -u heptapod -- bash -lc 'cd ~/aep && pnpm validate:sdk:live'
```

### Live results on this host

| Check                   | Result                                                         |
| ----------------------- | -------------------------------------------------------------- |
| Offline SDK checks      | PASS (including `@cursor/sdk-linux-x64`)                       |
| Auth / `models.list`    | PASS (`modelCount=48`)                                         |
| `bubblewrap /bin/true`  | PASS                                                           |
| Landlock present in LSM | PASS (after securityfs mount)                                  |
| Helper preflight/exec   | PASS (`cursorsandbox` with policy outside cwd)                 |
| Sandboxed `agent.send`  | **PASS** — `LIVE_VALIDATION_OK` after platform-package hoist |
| Retried without sandbox | **No** (fail closed)                                           |

### pnpm + `cursorsandbox` discovery

SDK looks for `node_modules/@cursor/sdk-linux-x64/bin/cursorsandbox` by walking from the entry script. pnpm nests that optional package under `.pnpm/`, so without hoist the SDK reports `sandbox_unsupported_on_host` even when the binary works manually.

Repo fix: root `.npmrc` `public-hoist-pattern[]=@cursor/sdk-*`, plus `scripts/wsl/hoist-sdk-linux-x64.sh` from sync.

## When to use WSL2

Use **WSL2 Ubuntu** (or another approved Linux host with a working sandbox helper) when:

- native Windows sandbox support is unavailable (expected — Cursor uses WSL2 for Windows); or
- AEP-002 / live validation records Windows native sandbox as blocked.

Do **not** disable sandbox to keep native Windows execution.

## Local checklist (developer machine)

1. Install WSL2 and an Ubuntu distro (`wsl --install -d Ubuntu-24.04`).
2. Install Node.js 26 (or ≥22.13.0) and pnpm 10.20.0 inside WSL.
3. Sync/clone the repository into the Linux filesystem (prefer `~/aep`, not `/mnt/c/…`).
4. Run `scripts/wsl/sync-aep-to-home.sh` (install + hoist) or `pnpm install` then `hoist-sdk-linux-x64.sh`.
5. Mount securityfs if `/sys/kernel/security/lsm` is missing.
6. Run live Cursor SDK sandbox validation and record results in `docs/validation/cursor-sdk-platform-matrix.md`.

## CI coverage

| Environment    | Covered by GitHub Actions CI | Sandbox proof                                   |
| -------------- | ---------------------------- | ----------------------------------------------- |
| Ubuntu runner  | Yes                          | Partial (no guarantee of Cursor sandbox helper) |
| Windows runner | Yes                          | Partial                                         |
| Developer WSL2 | Documented local path        | **Verified** sandboxed live path on this machine |

This document is the documented local WSL2 validation path required by **AEP-001**.
