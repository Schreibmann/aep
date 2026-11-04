# ADR-022 — Safe command runner

## Status

Accepted (AEP-032); covers ADR-009 command-runner core.

## Context

AEP must run Git/gates/tools without shell interpolation, with timeouts, output caps, and an executable allowlist.

## Decision

- Package `@aep/process` provides `TrustedCommandRegistry` + `SafeCommandRunner`.
- Launch via `spawn(executable, argv, { shell: false })` only.
- Env is allowlist-based (plus minimal PATH/SystemRoot baseline on Windows).
- Timeouts kill the process tree (`taskkill /T` on Windows, `SIGKILL` elsewhere).
- Stdout/stderr are byte-capped and optionally secret-redacted.

## Consequences

- `@aep/git-workspaces` can later switch `runGit` to this runner; argv-only Git remains the rule either way.
- Gate runners (later phases) MUST register trusted executables before use.
