# Architecture Decision Records

| ADR                                              | Title                                     | Status                                |
| ------------------------------------------------ | ----------------------------------------- | ------------------------------------- |
| [ADR-001](./ADR-001-local-first-cli.md)          | Local-first CLI-first product scope       | Accepted                              |
| [ADR-002](./ADR-002-cursor-only-runtime.md)      | Minimal `AgentRuntime`; Cursor-only v1    | Accepted                              |
| [ADR-003](./ADR-003-cursor-auth.md)              | Cursor SDK local runtime and auth flow    | Accepted                              |
| [ADR-004](./ADR-004-os-isolation.md)             | OS / security execution strategy          | Accepted (WSL sandbox verified)       |
| [ADR-005](./ADR-005-sqlite-driver.md)            | SQLite driver and migrations              | Accepted                              |
| ADR-006                                          | AEP DB vs Cursor SDK session store        | Pending (AEP-020+)                    |
| ADR-007                                          | Roles, sessions, reviewer assurance       | Pending                               |
| ADR-008                                          | Git worktree lifecycle                    | Pending                               |
| ADR-009                                          | Command runner and security policy        | Pending                               |
| [ADR-010](./ADR-010-pavan-workflow-reference.md) | Pavan's Workflow reference audit          | Accepted                              |
| [ADR-011](./ADR-011-model-cost-policy.md)        | Model catalog / no-unapproved-extra-spend | Accepted (live proof pending)         |
| ADR-012                                          | Cost provenance                           | Pending                               |
| ADR-013                                          | Concurrency policy                        | Pending                               |
| [ADR-014](./ADR-014-workflow-reducer.md)         | Deterministic workflow reducer (AEP-011)  | Accepted                              |
