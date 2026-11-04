# ADR-010: Pavan's Workflow reference audit and provenance

- Status: Accepted
- Date: 2026-11-04
- Task: AEP-003
- Audit date (UTC): 2026-11-04

## Source snapshot (pinned)

| Field                     | Value                                                             |
| ------------------------- | ----------------------------------------------------------------- |
| Project                   | [Pavan's Workflow](https://github.com/Pavan-Gopa/Pavans-Workflow) |
| Tag                       | `v3.8.0`                                                          |
| Full commit SHA           | `8c017953d09f3cec4a32e391b2243a8b01dc5a77`                        |
| Committer date            | `2026-10-19T04:19:10Z`                                            |
| License                   | MIT (Copyright (c) 2026 Pavan Gopa)                               |
| Host runtime of reference | Oh My Pi (OMP)                                                    |

Resolved via `git ls-remote` / GitHub API for `refs/tags/v3.8.0` → commit object. Do not substitute floating `main` for this audit.

## Reviewed files (this audit)

- `README.md`
- `CHANGELOG.md` (referenced; version badge 3.8.0)
- `PIPELINE.md`
- `INSTALL.md`
- `LICENSE`
- `AI_Workflow_Kit/docs/AI/TEAM_CONTRACT.md` (size confirmed at tag; rules referenced from README/PIPELINE)
- `.omp/` tree listing: agents, commands, `config.yml`, extensions (`workflow-guard.ts`, dashboard, model sync), libs, selftests
- `AI_Workflow_Kit/` docs/scripts/manifest layout (via tree listing)

## What the reference is

Public MIT workflow kit that configures **OMP** for a Main Orchestrator plus specialized workers (Coder, Reviewer, Tester, Architect, Security, design roles), file-backed state, Objective Gates, guard enforcement, model primary/backup failover, optional Graphify/Ponytail, and an OMP dashboard/Agent Hub.

It is **not** a standalone IDE, LLM, or universal SDK. AEP studies it as an ideas baseline only.

## Confirmed dependencies / coupling

- Requires OMP host (`omp` / `@oh-my-pi/pi-coding-agent`)
- Ships `.omp/` agents, extensions, hooks, and Python/TS helper scripts
- Optional Graphify; Ponytail for coder path
- Installer copies framework files into a target project; not usable as AEP’s runtime

## Concept mapping

| Reference concept                | AEP design                                       | Decision                                                |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| Main Orchestrator                | Deterministic TypeScript Workflow Engine         | **Accepted** (reimplement; AI does not own transitions) |
| Fresh specialized workers        | Separate Cursor SDK top-level sessions per role  | **Accepted** (reimplement)                              |
| Role / model mappings            | Cursor catalog + allowlisted role policy         | **Accepted** (Cursor-only v1)                           |
| Primary/backup provider failover | Bounded retry inside Cursor runtime              | **Simplified** — no second provider in v1               |
| Independent Reviewer             | Fresh read-only Cursor session + assurance label | **Accepted** with honest assurance semantics            |
| Tester worker                    | Deterministic Quality Gate Engine                | **Simplified** — no AI Tester in MVP                    |
| Objective Gates                  | Evidence-backed gate runner                      | **Accepted** (reimplement)                              |
| Workflow Guard                   | Policy + worktree + sandbox + OS isolation       | **Accepted** (strengthen; do not port OMP guard)        |
| File-backed state                | SQLite event journal                             | **Accepted** (replace implementation)                   |
| Fast Coder routing               | Measured task/model routing                      | **Deferred**                                            |
| Graphify                         | Optional context index                           | **Deferred**                                            |
| Ponytail / design skills         | Optional capabilities                            | **Deferred**                                            |
| OMP dashboard / Agent Hub        | AEP dashboard after CLI MVP                      | **Deferred** (rebuild, do not reuse OMP)                |
| `.omp/` config/hooks/extensions  | —                                                | **Rejected** as runtime basis                           |

## Guard / security observations affecting AEP

- Reference README claims guard blocks out-of-scope tool calls inside workers and verifies edits; still OMP-coupled.
- Architecture guidance for AEP: do not trust prompt-only guards; combine worktree isolation, Cursor sandbox, tool allowlists, and deterministic gates.
- Known class of risk to watch when studying guards: shell-side file changes and fail-open paths — AEP must fail closed on sandbox/helper failure.
- Automatic backup-model failover without human authorization in the reference is **not** copied; AEP forbids silent paid/extra-model switches.

## Provenance policy (normative)

1. **No fork** of Pavan's Workflow as the AEP repository base.
2. **No runtime dependency** on Pavan's Workflow, OMP, Graphify, or Ponytail.
3. **No code copy by default.** If a maintainer later approves adapting MIT-licensed snippets, preserve copyright/license notices and list borrowed files in an ADR amendment.
4. Do not claim affiliation, endorsement, or shared ownership.
5. AEP architecture/ADRs override the reference whenever they conflict.

## Licensing note for future MIT adaptation

MIT requires retention of copyright and permission notice in copies/substantial portions. Until explicitly approved, AEP contains **zero** copied source from the reference; only independently written TypeScript inspired by documented concepts.
