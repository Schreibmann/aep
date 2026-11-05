# ADR-030 — Planner profile and structured plan output

## Status

Accepted (AEP-050)

## Context

AEP must validate Planner output before any write-capable role. Architecture requires a versioned Agent Profile, Zod schema, read-only tools, and bounded retry on invalid JSON.

## Decision

- Add `@aep/agent-profiles` with `createPlannerProfile`, plan Zod schema, context gatherer, and `parsePlannerPlanWithBoundedRetry`.
- Planner tools come from `@aep/security` `PLANNER_TOOLS`; `assertPlannerReadOnly` fails closed on write/shell tools.
- `runTask` uses the profile system prompt, gathers truncated project context (AGENTS.md / package scripts), and stores `profileVersionHash` + validated plan on success.
- Invalid plans retry once with a repair prompt; still-invalid plans block the run (`invalid_planner_plan`).

## Consequences

- FakeAgentRuntime default result is a valid plan JSON so CLI/application smoke tests stay green.
- Later approval (AEP-052) can bind to the stored plan object / hash.
