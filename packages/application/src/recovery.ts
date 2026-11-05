import {
  isTerminalWorkflowRunStatus,
  reduceWorkflow,
  reduceWorkflowAll,
  type WorkflowEvent,
} from "@aep/domain";
import type { AepApplication } from "./create-app.ts";
import { ApplicationError } from "./errors.ts";
import type { ExecutionSnapshot, RecoveryOutcome, StoredRun } from "./run-store.ts";

export type RecoveryClassification =
  | { readonly kind: "terminal"; readonly status: string }
  | { readonly kind: "safely_resumable"; readonly execution: ExecutionSnapshot }
  | { readonly kind: "idle_non_terminal"; readonly status: string }
  | {
      readonly kind: "uncertain";
      readonly reason: "missing_opaque_agent_id" | "missing_execution_snapshot";
    };

export type ResumeRunInput = {
  readonly runId: string;
  /**
   * Required when classification is `uncertain` and the caller wants to retry
   * an interrupted operation whose side effects are unknown.
   */
  readonly confirmUncertainRetry?: boolean;
  /** Mark the run interrupted instead of resuming (explicit operator choice). */
  readonly markInterrupted?: boolean;
  /** Cancel the in-flight execution when safely resumable. */
  readonly cancel?: boolean;
};

export type ResumeRunResult = {
  readonly runId: string;
  readonly disposition: RecoveryOutcome;
  readonly status: string;
  readonly classification: RecoveryClassification["kind"];
  readonly executionId?: string;
  readonly agentId?: string;
  readonly resultText?: string;
};

/**
 * Classify a stored run for recovery after AEP process restart.
 */
export function classifyRunForRecovery(run: StoredRun): RecoveryClassification {
  if (isTerminalWorkflowRunStatus(run.aggregate.run.status)) {
    return { kind: "terminal", status: run.aggregate.run.status };
  }
  if (run.executionLifecycle !== "running") {
    return { kind: "idle_non_terminal", status: run.aggregate.run.status };
  }
  const execution = run.execution;
  if (execution === undefined) {
    return { kind: "uncertain", reason: "missing_execution_snapshot" };
  }
  if (execution.opaqueAgentId.trim().length === 0) {
    return { kind: "uncertain", reason: "missing_opaque_agent_id" };
  }
  return { kind: "safely_resumable", execution };
}

/**
 * Detect non-terminal workflow runs (startup scan).
 */
export function listNonTerminalRuns(app: AepApplication): ReadonlyArray<StoredRun> {
  return app.runs.list().filter((run) => !isTerminalWorkflowRunStatus(run.aggregate.run.status));
}

/**
 * Resume, cancel, or mark interrupted a run after process restart.
 * Never duplicates work when the aggregate is already terminal.
 * Never marks `completed` without verified evidence (domain reducer enforces that).
 */
export async function resumeRun(
  app: AepApplication,
  input: ResumeRunInput,
): Promise<ResumeRunResult> {
  const runId = input.runId.trim();
  if (runId.length === 0) {
    throw new ApplicationError("invalid_run_id", "run id must be non-empty");
  }

  const stored = app.runs.get(runId);
  if (stored === undefined) {
    throw new ApplicationError("run_not_found", `No run found for id ${runId}`);
  }

  const classification = classifyRunForRecovery(stored);

  if (classification.kind === "terminal") {
    return {
      runId,
      disposition: "already_terminal",
      status: classification.status,
      classification: "terminal",
      ...(stored.executionId === undefined ? {} : { executionId: stored.executionId }),
      ...(stored.agentId === undefined ? {} : { agentId: stored.agentId }),
      ...(stored.lastResultText === undefined ? {} : { resultText: stored.lastResultText }),
    };
  }

  if (classification.kind === "idle_non_terminal") {
    if (input.markInterrupted === true) {
      return markInterrupted(app, stored, "idle_non_terminal");
    }
    return {
      runId,
      disposition: "no_action",
      status: classification.status,
      classification: "idle_non_terminal",
      ...(stored.executionId === undefined ? {} : { executionId: stored.executionId }),
      ...(stored.agentId === undefined ? {} : { agentId: stored.agentId }),
      ...(stored.lastResultText === undefined ? {} : { resultText: stored.lastResultText }),
    };
  }

  if (input.markInterrupted === true) {
    return markInterrupted(app, stored, classification.kind);
  }

  if (classification.kind === "uncertain") {
    if (input.confirmUncertainRetry !== true) {
      throw new ApplicationError(
        "uncertain_recovery_requires_confirmation",
        `Run ${runId} cannot be safely resumed (${classification.reason}). Pass confirmUncertainRetry to retry, or markInterrupted to close it.`,
      );
    }
    // Explicit policy: uncertain retry marks interrupted rather than inventing a duplicate agent run.
    // Starting a fresh agent for uncertain side effects is deferred to a later task with human approval UX.
    return markInterrupted(app, stored, "uncertain");
  }

  const execution = classification.execution;

  if (input.cancel === true) {
    await app.runtime.cancelExecution(execution.executionId);
    const at = app.now();
    const aggregate = reduceWorkflow(stored.aggregate, {
      type: "run_cancelled",
      at,
    });
    const next: StoredRun = {
      ...stored,
      aggregate,
      executionLifecycle: "settled",
      recoveryOutcome: "cancelled",
      updatedAt: at,
    };
    app.runs.save(next);
    return {
      runId,
      disposition: "cancelled",
      status: aggregate.run.status,
      classification: "safely_resumable",
      executionId: execution.executionId,
      agentId: execution.opaqueAgentId,
    };
  }

  // Reviewer must never continue a write-capable tool policy even if snapshot was corrupted.
  const reviewerInheritedWriteTools =
    execution.roleId === "reviewer" &&
    (execution.tools.tools.includes("shell") ||
      execution.tools.tools.includes("edit") ||
      execution.tools.tools.includes("mcp") ||
      execution.tools.tools.includes("task"));

  const handle = await app.runtime.resumeExecution({
    executionId: execution.executionId,
    opaqueAgentId: execution.opaqueAgentId,
    roleId: execution.roleId,
    modelId: execution.modelId,
    cwd: execution.cwd,
    tools: execution.tools,
    sandbox: { enabled: true },
    ...(execution.systemPrompt === undefined ? {} : { systemPrompt: execution.systemPrompt }),
    ...(execution.modelParams === undefined ? {} : { modelParams: execution.modelParams }),
    ...(execution.catalogSnapshotId === undefined
      ? {}
      : { catalogSnapshotId: execution.catalogSnapshotId }),
    ...(execution.contextReset === true || reviewerInheritedWriteTools
      ? { forceFreshSession: true }
      : {}),
  });

  const result = await handle.wait();
  const at = app.now();
  const contextReset = handle.contextReset === true;
  const contextResetReason = handle.contextResetReason;

  const executionAfterResume: ExecutionSnapshot = {
    ...execution,
    opaqueAgentId: handle.agentId,
    ...(contextReset
      ? {
          contextReset: true,
          ...(contextResetReason === undefined ? {} : { contextResetReason }),
        }
      : {}),
  };

  if (result.status === "cancelled") {
    const aggregate = reduceWorkflow(stored.aggregate, { type: "run_cancelled", at });
    const next: StoredRun = {
      ...stored,
      aggregate,
      execution: executionAfterResume,
      executionLifecycle: "settled",
      recoveryOutcome: "cancelled",
      agentId: handle.agentId,
      executionId: execution.executionId,
      updatedAt: at,
    };
    app.runs.save(next);
    return {
      runId,
      disposition: "cancelled",
      status: aggregate.run.status,
      classification: "safely_resumable",
      executionId: execution.executionId,
      agentId: handle.agentId,
    };
  }

  if (result.status === "failed") {
    const events: WorkflowEvent[] = [
      {
        type: "agent_execution_failed",
        at,
        roleId: execution.roleId,
      },
    ];
    const aggregate = reduceWorkflowAll(stored.aggregate, events);
    const next: StoredRun = {
      ...stored,
      aggregate,
      execution: executionAfterResume,
      executionLifecycle: "settled",
      recoveryOutcome: "resumed",
      agentId: handle.agentId,
      executionId: execution.executionId,
      updatedAt: at,
      ...(result.safeMessage === undefined ? {} : { lastResultText: result.safeMessage }),
    };
    app.runs.save(next);
    return {
      runId,
      disposition: "resumed",
      status: aggregate.run.status,
      classification: "safely_resumable",
      executionId: execution.executionId,
      agentId: handle.agentId,
      ...(result.safeMessage === undefined ? {} : { resultText: result.safeMessage }),
    };
  }

  // completed agent result — advance planner path the same way as runTask, without claiming workflow completed
  const events: WorkflowEvent[] = [
    { type: "agent_execution_started", at, roleId: execution.roleId },
    { type: "agent_execution_completed", at, roleId: execution.roleId },
  ];
  if (execution.roleId === "planner" && stored.aggregate.run.status === "planning") {
    events.push({ type: "plan_proposed", at });
  }
  const aggregate = reduceWorkflowAll(stored.aggregate, events);
  const next: StoredRun = {
    ...stored,
    aggregate,
    execution: executionAfterResume,
    executionLifecycle: "settled",
    recoveryOutcome: "resumed",
    agentId: handle.agentId,
    executionId: execution.executionId,
    updatedAt: at,
    ...(result.resultText === undefined ? {} : { lastResultText: result.resultText }),
  };
  app.runs.save(next);

  return {
    runId,
    disposition: "resumed",
    status: aggregate.run.status,
    classification: "safely_resumable",
    executionId: execution.executionId,
    agentId: handle.agentId,
    ...(result.resultText === undefined ? {} : { resultText: result.resultText }),
  };
}

function markInterrupted(
  app: AepApplication,
  stored: StoredRun,
  classificationKind: RecoveryClassification["kind"],
): ResumeRunResult {
  const at = app.now();
  const aggregate = reduceWorkflow(stored.aggregate, { type: "run_interrupted", at });
  const next: StoredRun = {
    ...stored,
    aggregate,
    executionLifecycle: "settled",
    recoveryOutcome: "marked_interrupted",
    updatedAt: at,
  };
  app.runs.save(next);
  return {
    runId: stored.runId,
    disposition: "marked_interrupted",
    status: aggregate.run.status,
    classification: classificationKind,
    ...(stored.executionId === undefined ? {} : { executionId: stored.executionId }),
    ...(stored.agentId === undefined ? {} : { agentId: stored.agentId }),
  };
}
