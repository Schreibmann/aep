# Agent Engineering Platform (AEP)

Local-first TypeScript platform that owns deterministic engineering workflows and uses the **Cursor TypeScript Agent SDK** as the sole AI execution runtime for v1.

AEP does not replace Cursor IDE. Developers keep working in Cursor; AEP creates isolated agent sessions in Git worktrees, runs quality gates, and prepares changes for human review. Commit, push, merge, and deploy stay manual in v1.

## Status

Bootstrap phase (**AEP-001**). Packages and CLI land in later roadmap tasks.

- Agent instructions: [`AGENTS.md`](./AGENTS.md)
- Local maintainer specs (gitignored): `AEP-Architecture.md`, `AEP-Implementation-Roadmap.md`

## Requirements

| Tool    | Version                                                     |
| ------- | ----------------------------------------------------------- |
| Node.js | **26** (target LTS); minimum **22.13.0** (Cursor SDK floor) |
| pnpm    | **10.20.0** (see `packageManager` field)                    |
| Git     | system Git available on `PATH`                              |

## Setup

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

CI runs the same scripts on Ubuntu and Windows and does **not** require a Cursor API key.

## Planned CLI (later tasks)

```text
aep auth login
aep init .
aep doctor
aep models
aep run "<task>"
```

## Security defaults (v1)

- Cursor local sandbox required
- Reviewer sessions are read-only and separate from Implementer
- No second AI provider in v1
- Secrets stay out of prompts, logs, worktrees, and the AEP database

## WSL2 note

Native Windows sandbox support for Cursor SDK must be validated (AEP-002). If native sandbox cannot be confirmed, use **WSL2/Linux** as the supported secure execution host. See [`docs/development/wsl2-validation.md`](./docs/development/wsl2-validation.md).

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Follow the roadmap task IDs; do not expand scope without an ADR.
