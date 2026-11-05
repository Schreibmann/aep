# Contributing to AEP

## Before you start

1. Read local `AEP-Architecture.md` and `AEP-Implementation-Roadmap.md` (gitignored maintainer specs).
2. Take **one** roadmap task (for example `AEP-010`) and its dependencies.
3. Prefer small, reviewable diffs. Do not rewrite packages unless the task requires it.

## Local workflow

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Pin exact dependency versions. Do not use floating `latest` ranges.

## Design constraints

- v1 AI runtime: `@cursor/sdk` only, isolated under `packages/runtime-cursor`
- No Claude / Codex / OpenAI / Gemini / OMP runtime dependencies
- Deterministic workflow engine owns state transitions
- Writing agents use Git worktrees; never mutate the caller’s dirty main tree
- Sandbox stays enabled; fail closed if the helper is unavailable
- No automatic commit / push / merge / deploy

## Documentation

- Material architecture, security, or billing decisions → add an ADR under `docs/adr/`
- Platform validation evidence → `docs/validation/`
- Do not commit secrets, API keys, or live account dumps

## Branches

| Branch    | Role                                        |
| --------- | ------------------------------------------- |
| `main`    | Stable / release line                       |
| `develop` | Integration line and **repository default** |

Open pull requests from task branches (`aep/AEP-*`, etc.) into **`develop` only**. Do not target `main` or other task branches unless the maintainer explicitly asks.

## Pull requests

- Base branch: `develop`
- Reference the roadmap task ID in the PR title or description
- Include test updates for behavior changes
- Confirm CI green on Ubuntu and Windows
- Live Cursor SDK tests remain opt-in and must not be required for PR CI
