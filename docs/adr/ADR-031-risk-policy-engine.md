# ADR-031 — Risk and policy engine

## Status

Accepted (AEP-051)

## Context

Architecture §9.5 requires deterministic risk profiles (low / medium / high / critical) with fail-closed defaults. Unknown risk must never be silently treated as low. Critical work is analysis-only in v1.

## Decision

- Add `@aep/policy` with explicit path globs and task-keyword rules for auth, secrets, payment, crypto, migrations, CI/CD, and infrastructure.
- `classifyRisk` takes task text, plan `touchedPaths`, and plan approval flags; severity is the max matched rule.
- No elevated match and not docs-only → `medium` + `uncertain: true`.
- `evaluateRiskPolicy` maps risk to a domain `PolicyVerdict` (`require_approval` for low/medium/high, `deny` for critical) plus operational requirements (reviewer, strengthened gates, write execution allowed).
- Application wiring after plan parse stores the policy result; critical risk emits `policy_violation_detected` and blocks the run.

## Consequences

- Approval service (AEP-052) consumes stored requirements / verdict.
- Project-specific extra high-risk patterns can be passed without changing core rules.
