import { createImplementerProfile } from "@aep/agent-profiles";
import { reduceWorkflowAll, type WorkflowAggregate } from "@aep/domain";
import {
  ModelCatalogCache,
  ModelRoutingError,
  type ModelSelectionResult,
  resolveModelForRole,
} from "@aep/model-routing";
import { beginRoleUnderBudget, finishRoleUsage } from "./budget.ts";
import type { AepApplication } from "./create-app.ts";
import { ApplicationError } from "./errors.ts";
import type { ExecutionSnapshot, StoredRun } from "./run-store.ts";

export type RunImplementInput = {
  readonly runId: string;
  readonly cwd: string;
  readonly prompt?: string;
};

export type RunImplementResult = {
  readonly runId: string;
  readonly status: string;
  readonly executionId: string;
  readonly agentId: string;
  readonly resultText?: string;
};

/**
 * Single Implementer write pass in an isolated worktree cwd.
 * Expects workflow status implementing or fixing.
 */
export async function runImplementer(
  app: AepApplication,
  input: RunImplementInput,
): Promise<RunImplementResult> {
  const runId = input.runId.trim();
  const stored = app.runs.get(runId);
  if (stored === undefined) {
    throw new ApplicationError("run_not_found", `No run found for id ${runId}`);
  }
  const status = stored.aggregate.run.status;
  if (status !== "implementing" && status !== "fixing") {
    throw new ApplicationError(
      "invalid_run_status",
      `Implementer requires implementing/fixing, got ${status}`,
    );
  }
  if (stored.plan === undefined) {
    throw new ApplicationError("plan_missing", "Implementer requires a validated plan");
  }

  const budget = beginRoleUnderBudget({
    state: stored.budget,
    policy: stored.budgetPolicy,
    roleId: "implementer",
  });

  const profile = createImplementerProfile();
  const catalogCache = new ModelCatalogCache();
  let selection: ModelSelectionResult;
  try {
    const catalog = await catalogCache.refresh(() => app.runtime.discoverModels());
    selection = resolveModelForRole({
      roleId: "implementer",
      catalog,
      config: { roles: [] },
    });
  } catch (error) {
    if (error instanceof ModelRoutingError) {
      throw new ApplicationError(error.code, error.message);
    }
    throw error;
  }

  const prompt =
    input.prompt?.trim() ||
    [
      `Task:\n${stored.taskDescription}`,
      `Approved plan:\n${JSON.stringify(stored.plan)}`,
      "Implement the plan. Stay inside approved touchedPaths. Do not commit or push.",
    ].join("\n\n");

  const executionId = app.createId("exec");
  const handle = await app.runtime.startExecution({
    executionId,
    roleId: "implementer",
    prompt,
    modelId: selection.modelId,
    cwd: input.cwd,
    tools: profile.tools,
    sandbox: { enabled: true },
    systemPrompt: profile.systemPrompt,
    catalogSnapshotId: selection.catalogSnapshotId,
    ...(selection.modelParams.length === 0 ? {} : { modelParams: selection.modelParams }),
  });

  let aggregate: WorkflowAggregate = reduceWorkflowAll(stored.aggregate, [
    { type: "agent_execution_started", at: app.now(), roleId: "implementer" },
  ]);
  const startedAt = app.now();
  const execution: ExecutionSnapshot = {
    executionId,
    opaqueAgentId: handle.agentId,
    roleId: "implementer",
    modelId: selection.modelId,
    cwd: input.cwd,
    tools: profile.tools,
    systemPrompt: profile.systemPrompt,
    startedAt,
    catalogSnapshotId: selection.catalogSnapshotId,
    modelSelectionRationale: selection.rationale,
    ...(selection.modelParams.length === 0 ? {} : { modelParams: selection.modelParams }),
  };
  app.runs.save({
    ...stored,
    aggregate,
    budget,
    executionLifecycle: "running",
    execution,
    executionId,
    agentId: handle.agentId,
    updatedAt: startedAt,
  });

  const result = await handle.wait();
  const usage = await app.runtime.getUsage(executionId);
  app.usage.save({
    id: app.createId("usage"),
    executionId,
    roleId: "implementer",
    modelId: selection.modelId,
    catalogSnapshotId: selection.catalogSnapshotId,
    usage,
    source: "cursor_sdk_get_usage",
    observedAt: app.now(),
  });
  const nextBudget = finishRoleUsage({
    state: budget,
    policy: stored.budgetPolicy,
    usage,
  });

  const current = app.runs.get(runId) ?? stored;
  if (result.status !== "completed") {
    aggregate = reduceWorkflowAll(current.aggregate, [
      { type: "agent_execution_failed", at: app.now(), roleId: "implementer" },
    ]);
    app.runs.save({
      ...current,
      aggregate,
      budget: nextBudget,
      executionLifecycle: "settled",
      updatedAt: app.now(),
    });
    throw new ApplicationError("implementer_failed", `Implementer execution ${result.status}`);
  }

  aggregate = reduceWorkflowAll(current.aggregate, [
    { type: "agent_execution_completed", at: app.now(), roleId: "implementer" },
  ]);
  const next: StoredRun = {
    ...current,
    aggregate,
    budget: nextBudget,
    executionLifecycle: "settled",
    executionId,
    agentId: handle.agentId,
    ...(result.resultText === undefined ? {} : { lastResultText: result.resultText }),
    updatedAt: app.now(),
  };
  app.runs.save(next);

  return {
    runId,
    status: aggregate.run.status,
    executionId,
    agentId: handle.agentId,
    ...(result.resultText === undefined ? {} : { resultText: result.resultText }),
  };
}
