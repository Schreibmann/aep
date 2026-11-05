# ADR-034 — Reviewer role and finding schema

## Status

Accepted (AEP-054)

## Context

Architecture §6.1 / §13.3 require a fresh read-only Reviewer session, Zod-validated ReviewReport, evidence for blocking findings, and truthful `reviewAssurance` (never claim provider independence).

## Decision

- Extend `@aep/agent-profiles` with `createReviewerProfile`, review Zod schema, and `parseReviewReportWithBoundedRetry`.
- Reviewer tools come from `@aep/security` `REVIEWER_TOOLS`; `assertReviewerReadOnly` fails closed.
- Blocking critical/high findings require evidence plus file/line or a `logic:` evidence prefix.
- `runReview` always uses `startExecution` (never resume Implementer), records `contextReset`, overwrites report `assurance` from model routing, and persists model id + report on `StoredRun`.
- Same-catalog model reuse is labelled `same_model_fresh_session`.

## Consequences

- Fix cycles (AEP-055) consume `reviewReport` blocking findings.
- Fake default planner JSON is not used for reviewer scripts; tests supply review JSON.
