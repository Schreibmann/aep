# ADR-003: Cursor SDK local runtime and auth flow

- Status: Accepted
- Date: 2026-11-04
- Task: AEP-003

## Decision

Authentication uses an explicit Cursor API key (`apiKey` / `CURSOR_API_KEY`) or `Cursor.auth.login()`. AEP MUST NOT assume Cursor IDE login credentials are available to the SDK. Live SDK calls are opt-in and never required by PR CI.

Pinned during AEP-002: `@cursor/sdk@1.3.1` (Node `>=22.13`).

## Consequences

- Secrets stay out of project files, prompts, logs, and the AEP database.
- `aep doctor` / auth status report presence without printing the key.
- Live validation remains gated by `AEP_LIVE_CURSOR_SDK=1` until AEP-004 proves account entitlement.
