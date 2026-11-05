# ADR-041 — Project knowledge packs

## Status

Accepted (AEP-063)

## Context

Planner/Reviewer context must come from real project documents with source hashes, not speculative generated instructions. Maintainers must be able to review and edit packs. Secrets and generated trees must never be packed.

## Decision

- Build versioned JSON packs under `.aep/knowledge/` from an allowlisted set of source paths.
- Track `sourcePath` + SHA-256 `sourceHash`; preserve existing packs unless `--overwrite`.
- `updateKnowledgePack` marks `reviewed: true` after maintainer edits.
- `assembleKnowledgeContext` ranks by query/category/reviewed and truncates to a token budget.
- CLI: `aep knowledge build|list`; planner path appends assembled packs when present.

## Consequences

- Generic filler content is never auto-generated.
- `.env` / `secrets/` / `node_modules` / build outputs are excluded by path policy.
