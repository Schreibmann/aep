# ADR-001: Local-first CLI-first product scope

- Status: Accepted
- Date: 2026-11-04
- Task: AEP-003

## Decision

AEP v1 is a local-first CLI product. Core workflow runs on the developer machine without a remote AEP server. A dashboard may follow after CLI MVP and remains a read/approval UI over the same application services.

## Consequences

- Prefer SQLite, Git, and CLI over new infrastructure.
- Do not build multi-tenant cloud control plane in v1.
- Cursor inference still requires network access to Cursor; “local” does not mean local models.
