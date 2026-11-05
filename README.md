# Agent Engineering Platform (AEP)

Local-first TypeScript monorepo that runs **deterministic engineering workflows** and uses the **Cursor TypeScript Agent SDK** as the only AI runtime in v1.

AEP does not replace Cursor IDE. Developers keep editing in Cursor; AEP plans work, opens isolated Git worktrees for writing agents, runs trusted quality gates, reviews changes in a fresh read-only session, and leaves **commit / push / merge / deploy** to humans.

Default agent runtime in local CLI/tests is `FakeAgentRuntime` (no API key, no billable calls). Wire Cursor when you need live runs.

## What works today

| Area          | Capability                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| CLI           | `doctor`, `auth status`, `models`, `init`, `knowledge`, `run`, `status`, `approve`, `resume`, `recoveries`, `serve` |
| Workflow      | Planner → plan approval → Implementer → gates → Reviewer → bounded fix cycles → budget checks                       |
| Project setup | Stack detection, `.aep/config.yaml`, approved gate scripts only                                                     |
| Knowledge     | Versioned packs from real docs (hashed sources; secrets/generated paths excluded)                                   |
| Local API     | Authenticated loopback HTTP API for runs, events, approvals, models, usage, worktrees                               |
| Dashboard     | React + Vite UI (projects, runs, timeline, approvals, models, economy, settings) — API client only                  |

Roadmap through **P7 (AEP-073)** is implemented on the current development line. GitLab/GitHub integrations (P8) are not in v1 yet.

## Architecture

```text
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  apps/cli   │────▶│ application  │────▶│ domain workflow │
│  apps/api   │     │  use-cases   │     │  reducer/events │
│  dashboard  │     └──────┬───────┘     └─────────────────┘
└─────────────┘            │
         ┌─────────────────┼──────────────────────────┐
         ▼                 ▼                          ▼
 runtime-contracts    policy / quality-gates    project-profiles
 runtime-cursor*      process (safe cmds)       git-workspaces
 model-routing        security / persistence    agent-profiles
```

\* `@cursor/sdk` is imported **only** from `packages/runtime-cursor`. Domain and application stay SDK-free.

**Normative rules (v1):**

- Orchestrator is deterministic TypeScript; agents do not own workflow state transitions.
- Writing agents run in isolated Git worktrees; local Cursor sandbox stays enabled.
- Gate argv comes from trusted project profile / approved `package.json` script names — never from free-form model text.
- Reviewer is a fresh read-only session; it consumes gate evidence, it does not invent pass/fail.
- Usage shows tokens, provider-reported billed amounts, plan-included, and unknown cost as **separate** categories (no fake `$0` from tokens alone).

Decision log: [`docs/adr/`](./docs/adr/). Agent constraints: [`AGENTS.md`](./AGENTS.md). Maintainer specs (gitignored): `AEP-Architecture.md`, `AEP-Implementation-Roadmap.md`.

## Repository layout

```text
apps/
  cli/          # `aep` CLI
  api/          # loopback local API (`aep serve` / `aep-api`)
  dashboard/    # React + Vite UI
packages/
  domain/              # workflow aggregate, events, reducer
  application/         # use-cases (run, approve, gates, review, …)
  runtime-contracts/   # AgentRuntime + FakeAgentRuntime
  runtime-cursor/      # Cursor SDK adapter
  agent-profiles/      # Planner / Implementer / Reviewer schemas
  policy/              # risk + human approval binding
  quality-gates/       # trusted gate engine
  project-profiles/    # stack detect, init config, knowledge packs
  git-workspaces/      # inspect + managed worktrees
  process/             # SafeCommandRunner
  model-routing/       # catalog + role model selection + budgets
  security/            # role tool allowlists, credentials helpers
  persistence/         # SQLite / Drizzle foundations
```

## Requirements

| Tool    | Version                                                           |
| ------- | ----------------------------------------------------------------- |
| Node.js | **≥ 22.13.0** (Cursor SDK floor; maintainer target often Node 26) |
| pnpm    | **10.20.0** (`packageManager` field)                              |
| Git     | on `PATH`                                                         |

## Setup

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
```

CI runs the same checks on Ubuntu and Windows and does **not** require a Cursor API key.

Useful scripts:

```bash
pnpm aep -- --help                 # CLI via workspace
pnpm --filter @aep/dashboard dev   # dashboard (Vite)
pnpm --filter @aep/api start       # API process directly
```

## Quick start (fake runtime)

From the repo root after install:

```bash
# 1) Health
pnpm aep -- doctor

# 2) Init a project (writes .aep/config.yaml once; never overwrites AGENTS.md)
pnpm aep -- init path/to/project
pnpm aep -- init path/to/project --approve-gate check:all

# 3) Optional knowledge packs from real docs
pnpm aep -- knowledge build path/to/project
pnpm aep -- knowledge list path/to/project

# 4) Start a run (FakeAgentRuntime by default)
pnpm aep -- run "Add healthcheck endpoint" --json

# 5) Inspect / approve plan when status is awaiting_plan_approval
pnpm aep -- status <run-id>
pnpm aep -- approve <run-id> --approve --approver you --rationale "Looks good"
```

Auth diagnostics (never prints secrets):

```bash
pnpm aep -- auth status
pnpm aep -- models
```

## Local API + dashboard

API binds to **127.0.0.1** by default and requires a Bearer token. Non-loopback bind needs `--allow-lan` and still requires auth.

```bash
# Terminal A — API (prints a generated token unless AEP_API_TOKEN is set)
pnpm aep -- serve --port 7432
# or: AEP_API_TOKEN=… pnpm aep -- serve

# Terminal B — dashboard (proxies /api → http://127.0.0.1:7432)
pnpm --filter @aep/dashboard dev
```

Open the Vite URL, paste the API token in **Settings**, then use Runs / Timeline / Approvals / Models / Economy.

Example API calls:

```bash
export AEP_API_TOKEN=…   # from serve output or your env

curl -s -H "Authorization: Bearer $AEP_API_TOKEN" http://127.0.0.1:7432/runs
curl -s -H "Authorization: Bearer $AEP_API_TOKEN" http://127.0.0.1:7432/runs/<run-id>/events
curl -s -H "Authorization: Bearer $AEP_API_TOKEN" http://127.0.0.1:7432/approvals
curl -s -H "Authorization: Bearer $AEP_API_TOKEN" http://127.0.0.1:7432/usage
```

`GET /health` is unauthenticated only on loopback listeners.

## CLI reference (v1)

```text
aep doctor
aep auth status
aep models
aep init [path] [--approve-gate <name>] [--no-auto-approve-exact]
aep knowledge build [path] [--overwrite]
aep knowledge list [path]
aep run <task>
aep status <run-id>
aep approve <run-id> --approve|--reject --approver <id> --rationale <text>
aep resume <run-id> [--confirm-uncertain|--mark-interrupted|--cancel]
aep recoveries
aep serve [--host 127.0.0.1] [--port 7432] [--allow-lan]
```

There is no `aep commit`, `aep push`, `aep merge`, or `aep deploy` in v1.

## Security defaults

- Cursor local sandbox required for live sessions; do not disable it to “unblock” errors.
- Reviewer tools are read-only and isolated from Implementer sessions.
- No second AI provider (Claude / Codex / OpenAI / Gemini / OMP) in v1.
- Secrets stay out of prompts, logs, knowledge packs, config YAML, and reports.
- Quality gates execute only allowlisted commands via Safe Command Runner.

## Live Cursor SDK (opt-in, billable)

Most tests use FakeAgentRuntime. Live SDK checks are explicit and may consume quota:

```bash
pnpm validate:sdk:offline
pnpm validate:sdk:auth      # needs credentials; never commit them
pnpm validate:sdk:live      # billable
```

On Windows, Cursor’s filesystem sandbox runs inside WSL2 Linux. For secure live sessions, prefer a validated WSL2 host — see [`docs/development/wsl2-validation.md`](./docs/development/wsl2-validation.md).

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

- `develop` is the default branch and the only PR base for task branches (`aep/AEP-*`).
- `main` is the stable/release line.
- Run `pnpm lint:fix` before every commit; run `pnpm typecheck` before every review PR.
- One roadmap task per change set; record material decisions as ADRs under `docs/adr/`.
