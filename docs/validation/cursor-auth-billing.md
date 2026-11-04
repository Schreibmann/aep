# Cursor auth, entitlement, and billing probe (AEP-004)

Date: **2026-11-04** (live re-run after `.env` key added)  
Related: ADR-003, ADR-011, `docs/validation/cursor-sdk-platform-matrix.md`

## Commands

```bash
# Loads CURSOR_API_KEY from environment or repo-root .env (gitignored)
pnpm validate:sdk:auth

# Live catalog
AEP_LIVE_CURSOR_SDK=1 pnpm validate:sdk:auth

# Minimal sandboxed agent + usage
AEP_LIVE_CURSOR_SDK=1 pnpm validate:sdk:live
```

## Maintainer run (live)

| Check                             | Result                                                 |
| --------------------------------- | ------------------------------------------------------ |
| `CURSOR_API_KEY` present          | **Yes** (via gitignored `.env`; not committed)         |
| `AEP_LIVE_CURSOR_SDK`             | `1`                                                    |
| `pnpm validate:sdk:auth`          | **PASS** — `authStatus=catalog_ok`, `modelCount=48`    |
| Catalog / plan entitlement        | **PASS** (catalog reachable for this user key)         |
| `run.usage` token capture         | **Blocked by sandbox** — live send failed before usage |
| `agent.getUsage()`                | **Not reached** on win32 native                        |
| SDK tag in Cursor usage dashboard | Confirm manually after a successful sandboxed run      |
| Privacy Mode note                 | Local filesystem agent loop ≠ local inference          |
| Third-party / extra-charge models | Still disabled until explicit allowlist                |

## Rules

1. Do not enable unapproved extra-cost models.
2. Persist token counts when available; store missing dollars as `unknown`, never `$0`.
3. User API keys bill to the user plan; service-account keys bill to the team.
4. CLI `aep doctor` / `aep auth status` (AEP-013+) must reuse this probe’s semantics without printing secrets.
