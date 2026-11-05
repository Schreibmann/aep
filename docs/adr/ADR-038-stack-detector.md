# ADR-038 — Stack detector

## Status

Accepted (AEP-060)

## Context

Onboarding must inspect package manager, frameworks, scripts, and instruction files without trusting or executing project scripts.

## Decision

- Add `@aep/project-profiles` with `detectStack(rootPath)`.
- Evidence + confidence accompany every claim.
- Exact script names (`lint`, `typecheck`, `test`, `build`) map to gates without confirmation; fuzzy matches are `needsConfirmation: true`.
- Detection never runs script bodies.

## Consequences

- `aep init` (AEP-061) consumes the report and asks for confirmation on ambiguous scripts.
