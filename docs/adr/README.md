# Architecture Decision Records

| ADR                                              | Title                                      | Status                          |
| ------------------------------------------------ | ------------------------------------------ | ------------------------------- |
| [ADR-001](./ADR-001-local-first-cli.md)          | Local-first CLI-first product scope        | Accepted                        |
| [ADR-002](./ADR-002-cursor-only-runtime.md)      | Minimal `AgentRuntime`; Cursor-only v1     | Accepted                        |
| [ADR-003](./ADR-003-cursor-auth.md)              | Cursor SDK local runtime and auth flow     | Accepted                        |
| [ADR-004](./ADR-004-os-isolation.md)             | OS / security execution strategy           | Accepted (WSL sandbox verified) |
| [ADR-005](./ADR-005-sqlite-driver.md)            | SQLite driver and migrations               | Accepted                        |
| ADR-006                                          | AEP DB vs Cursor SDK session store         | Pending (AEP-020+)              |
| ADR-007                                          | Roles, sessions, reviewer assurance        | Pending                         |
| [ADR-021](./ADR-021-worktree-manager.md)         | Git worktree lifecycle (AEP-031)           | Accepted (was ADR-008)          |
| [ADR-022](./ADR-022-safe-command-runner.md)      | Safe command runner (AEP-032)              | Accepted (was ADR-009)          |
| [ADR-010](./ADR-010-pavan-workflow-reference.md) | Pavan's Workflow reference audit           | Accepted                        |
| [ADR-011](./ADR-011-model-cost-policy.md)        | Model catalog / no-unapproved-extra-spend  | Accepted (live proof pending)   |
| ADR-012                                          | Cost provenance                            | Pending                         |
| ADR-013                                          | Concurrency policy                         | Pending                         |
| [ADR-014](./ADR-014-workflow-reducer.md)         | Deterministic workflow reducer (AEP-011)   | Accepted                        |
| [ADR-015](./ADR-015-runtime-contracts.md)        | AgentRuntime + FakeAgentRuntime (AEP-012)  | Accepted                        |
| [ADR-016](./ADR-016-cli-bootstrap.md)            | CLI + application DI (AEP-013)             | Accepted                        |
| [ADR-017](./ADR-017-persistence-sqlite.md)       | Persistence package / migrations (AEP-020) | Accepted                        |
| [ADR-018](./ADR-018-event-journal.md)            | Event journal + projections (AEP-021)      | Accepted                        |
| [ADR-019](./ADR-019-recovery-resume.md)          | Recovery / resume after restart (AEP-022)  | Accepted                        |
| [ADR-020](./ADR-020-repository-inspector.md)     | Repository inspector (AEP-030)             | Accepted                        |
