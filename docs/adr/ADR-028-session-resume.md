# ADR-028 — Session resume and permission reapplication

## Status

Accepted (AEP-043)

## Context

Cursor local `tools`, `disallowedTools`, `systemPrompt`, and sandbox options are not reliably persisted across `Agent.resume()`. Reviewer must remain an isolated read-only session and must never inherit an Implementer `agentId`.

## Decision

- Persist opaque `agentId` with role tool policy, model, cwd, and optional settingSources in AEP `ExecutionSnapshot`.
- On resume, always re-pass tools, disallowedTools, systemPrompt, sandbox (`enabled: true`), model/params, and settingSources.
- `AgentSessionRegistry` tracks in-process role ownership of agent IDs.
- `evaluateResumeSafety` refuses Reviewer←Implementer (and other role mismatches); runtime opens a **fresh** session and sets `contextReset` + reason.
- If SDK `Agent.resume` throws, fall back to a fresh session with explicit `contextReset` — never pretend continuity.

## Consequences

- Recovery / workflow layers record `contextReset` on the execution snapshot.
- Cross-process registry is empty after restart; resume still reapplies permissions from the stored snapshot and may succeed via SDK resume when the agentId remains valid.
