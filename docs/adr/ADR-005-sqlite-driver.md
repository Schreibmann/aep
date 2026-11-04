# ADR-005: SQLite driver and migration strategy

- Status: Accepted
- Date: 2026-11-04
- Task: AEP-003 (decision from AEP-002 smoke)

## Decision

AEP canonical persistence uses **SQLite** via **Drizzle ORM** and **`better-sqlite3`**. AEP-002 smoke on Windows 11 / Node 26.1.0 passed with WAL and foreign keys enabled.

Do **not** switch to experimental/`node:sqlite` without a new ADR and explicit tradeoff analysis.

Cursor SDK’s own local session store remains separate from the AEP database (see ADR-006 when implemented).

## Consequences

- Native module install must be validated on CI OS matrix (Ubuntu + Windows).
- Persistence package (AEP-020) adopts this driver and owns migrations.
