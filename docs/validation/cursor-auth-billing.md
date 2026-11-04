# Cursor auth, entitlement, and billing probe (AEP-004)

Date: **2026-11-04**  
Related: ADR-003, ADR-011, `docs/validation/cursor-sdk-platform-matrix.md`

## Commands

```bash
# Default: no live network call required for the missing-key path
pnpm validate:sdk:auth

# Live catalog (billable account / network)
AEP_LIVE_CURSOR_SDK=1 CURSOR_API_KEY=… pnpm validate:sdk:auth

# Minimal sandboxed agent + usage (billable)
AEP_LIVE_CURSOR_SDK=1 CURSOR_API_KEY=… pnpm validate:sdk:live
```

## Maintainer run (this session)

| Check                             | Result                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `CURSOR_API_KEY` present          | **No**                                                                            |
| `AEP_LIVE_CURSOR_SDK`             | unset                                                                             |
| `pnpm validate:sdk:auth`          | exit 2, `authStatus=missing_key`                                                  |
| Catalog / plan entitlement        | **Blocked**                                                                       |
| `run.usage` token capture         | **Blocked** (needs live run)                                                      |
| `agent.getUsage()`                | **Blocked** (needs live run; `feature_unavailable` is an accepted capability gap) |
| SDK tag in Cursor usage dashboard | **Blocked**                                                                       |
| Privacy Mode note                 | Documented: local filesystem agent loop ≠ local inference                         |
| Third-party / extra-charge models | Disabled until explicit allowlist                                                 |

## Rules until live proof lands

1. Do not enable unapproved extra-cost models.
2. Persist token counts when available; store missing dollars as `unknown`, never `$0`.
3. User API keys bill to the user plan; service-account keys bill to the team — confirm on first live run.
4. CLI `aep doctor` / `aep auth status` (AEP-013+) must reuse this probe’s semantics without printing secrets.
