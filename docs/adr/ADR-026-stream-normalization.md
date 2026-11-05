# ADR-026 — Stream normalization and cancellation

## Status

Accepted (AEP-041)

## Context

Cursor SDK stream envelopes evolve; tool args/results are unstable. AEP must keep a stable AgentEvent model, drop private reasoning, and cancel cleanly.

## Decision

- `parseUnknownSdkMessage` / `normalizeSdkStreamEvent` defensively map SDK messages.
- Thinking/reasoning content is dropped (never buffered or returned).
- `BoundedEventBuffer` retains ordered important events with a max size (oldest dropped).
- `cancelExecution` marks the active run cancelled, cancels the SDK run, and `wait()` returns `cancelled`.
- Optional `defaultTimeoutMs` cancels and fails with `execution_timeout`.

## Consequences

- Journal persistence (later) can snapshot `getRecordedEvents` before dispose.
- Unknown event types become opaque `status` markers and never crash the run.
