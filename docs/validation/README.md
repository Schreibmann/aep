# Validation evidence

## AEP-002

- Matrix: [`cursor-sdk-platform-matrix.md`](./cursor-sdk-platform-matrix.md)
- Offline scripts: `pnpm validate:sdk:offline`, `pnpm validate:sqlite`
- Live opt-in: `pnpm validate:sdk:live` (requires `AEP_LIVE_CURSOR_SDK=1` and `CURSOR_API_KEY`)

## AEP-004

- Auth/billing probe notes: [`cursor-auth-billing.md`](./cursor-auth-billing.md)
- Script: `pnpm validate:sdk:auth`

Do not commit API keys, account secrets, or raw credential material.
