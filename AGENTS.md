# Agent instructions for AEP

This repository is the **Agent Engineering Platform (AEP)**. Before changing code, read both local normative documents in full (gitignored; provided by the maintainer):

1. `AEP-Architecture.md` — target architecture and compliance rules
2. `AEP-Implementation-Roadmap.md` — ordered implementation backlog

## Mandatory rules

0. Run `pnpm lint:fix` before every git commit; do not commit with a failing `pnpm lint`.
1. Execute **only the assigned roadmap task** and its declared dependencies. Do not start later phases on your own.
2. Start with **AEP-001** unless the maintainer explicitly assigns a different task ID.
3. Treat `MUST` / `MUST NOT` / `SHOULD` / `MAY` in the architecture as normative.
4. Do **not** add Claude Agent SDK, Codex, OpenAI/Gemini APIs, OMP, or any second AI runtime in v1.
5. Import `@cursor/sdk` **only** from `packages/runtime-cursor` (created in later tasks). Domain and application packages must stay SDK-free.
6. AEP Orchestrator is deterministic TypeScript. AI agents must not own workflow state transitions.
7. Local Cursor sessions require `local.sandboxOptions.enabled: true`. Never disable sandbox to unblock an error.
8. Writing agents operate only in isolated Git worktrees. Do not mutate the user’s main working tree.
9. No automatic `git commit`, `git push`, merge, or deploy in v1.
10. Do not print or commit secrets, API keys, `.env` contents, or credentials.
11. Prefer FakeAgentRuntime tests; live Cursor SDK tests are opt-in and billable.
12. End each task with evidence: changed files, decisions, commands run, results, limits, and remaining risks.
13. Git branches: `main` is the stable/release line; `develop` is the repository default and the **only** PR base for task branches (`aep/AEP-*`, etc.).

## Recommended first sequence

```text
AEP-001 → AEP-002 → AEP-003 → AEP-004 → AEP-010 → …
```

See section 6 of the roadmap for the full dependency chain.
