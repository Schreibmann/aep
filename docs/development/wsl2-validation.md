# WSL2 validation path

AEP local agent sessions require Cursor SDK `local.sandboxOptions.enabled: true`. CI on GitHub-hosted runners cannot fully prove sandbox helper behavior on a developer machine.

## When to use WSL2

Use **WSL2 Ubuntu** (or another approved Linux host with a working sandbox helper) when:

- native Windows sandbox support is unavailable, flaky, or unverified; or
- AEP-002 records Windows native sandbox as blocked.

Do **not** disable sandbox to keep native Windows execution.

## Local checklist (developer machine)

1. Install WSL2 and an Ubuntu distro.
2. Install Node.js 26 (or ≥22.13.0) and pnpm 10.20.0 inside WSL.
3. Clone the repository into the Linux filesystem (prefer `~/…`, not `/mnt/c/…` for IO and sandbox fidelity).
4. Run `pnpm install --frozen-lockfile` and the standard `lint` / `typecheck` / `test` / `build` scripts.
5. After AEP-002 lands, run the Cursor SDK sandbox matrix from WSL and record results in `docs/validation/cursor-sdk-platform-matrix.md`.

## CI coverage

| Environment    | Covered by GitHub Actions CI | Sandbox proof                                   |
| -------------- | ---------------------------- | ----------------------------------------------- |
| Ubuntu runner  | Yes                          | Partial (no guarantee of Cursor sandbox helper) |
| Windows runner | Yes                          | Partial                                         |
| Developer WSL2 | Documented local path        | Required when Windows native is unsupported     |

This document is the documented local WSL2 validation path required by **AEP-001**.
