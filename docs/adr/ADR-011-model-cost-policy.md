# ADR-011: Model catalog and no-unapproved-extra-spend

- Status: Accepted (account-specific proof pending AEP-004)
- Date: 2026-11-04
- Task: AEP-003

## Decision

Model IDs and params come only from `Cursor.models.list()` for the connected account. AEP defaults to `no-unapproved-extra-model-spend`: do not select third-party / extra-charge options unless the user allowlists them. Missing or unavailable models block the run; never silently substitute a more expensive model.

Exact billed cost may be unavailable (`feature_unavailable` / delayed settlement). Persist tokens when present; mark absent dollars as `unknown`, never `$0`.

## Consequences

- AEP-004 must prove auth, catalog, and usage reporting for the maintainer account before live runs.
- Role routing records catalog snapshot id + selection rationale.
