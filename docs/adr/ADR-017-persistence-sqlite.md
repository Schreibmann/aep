# ADR-017: AEP persistence package (SQLite migrations)

- Status: Accepted
- Date: 2026-11-05
- Task: AEP-020

## Decision

Canonical AEP state lives in `@aep/persistence` using Drizzle ORM + `better-sqlite3` (ADR-005). Schema/migrations cover projects, tasks, workflow runs, role executions, agent sessions, workspaces, workflow events, approvals, gates, evidence, review findings, usage records, model catalog snapshots, and settings.

Connection defaults: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`. Migrations are ordered SQL files applied idempotently via `aep_schema_migrations`. Local backup uses `better-sqlite3` `.backup()`.

Cursor SDK session/conversation storage remains a separate store and is never opened by this package.

## Consequences

- No API keys or other secrets in AEP DB columns.
- Event journal write/projection transactions land in AEP-021.
- Native `better-sqlite3` must keep working on CI Ubuntu/Windows matrix.
