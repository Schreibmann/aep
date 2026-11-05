import {
  buildPlannerUserPrompt,
  buildPlanRepairPrompt,
  createPlannerProfile,
  gatherPlannerProjectContext,
  type PlannerPlan,
  parsePlannerPlanWithBoundedRetry,
} from "@aep/agent-profiles";
import {
  createInitialWorkflowAggregate,
  createProjectId,
  createTaskId,
  createWorkflowRunId,
  reduceWorkflowAll,
  type WorkflowEvent,
} from "@aep/domain";
import {
  ModelCatalogCache,
  ModelRoutingError,
  type ModelSelectionResult,
  resolveModelForRole,
} from "@aep/model-routing";
import { classifyRisk, evaluateRiskPolicy, type RiskPolicyResult } from "@aep/policy";
import { assertPlannerReadOnly } from "@aep/security";
import type { AepApplication } from "./create-app.js";
import { ApplicationError } from "./errors.js";
import type { ExecutionSnapshot, StoredRun } from "./run-store.js";

export type RunTaskInput = {
  readonly task: string;
  readonly cwd: string;
};

export type RunTaskResult = {
  readonly runId: string;
  readonly executionId: string;
  readonly agentId: string;
  readonly status: string;
  readonly resultText?: string;
  readonly plan?: PlannerPlan;
  readonly plannerProfileVersionHash?: string;
  readonly planSchemaVersion?: string;
  readonly policy?: RiskPolicyResult;
};

/**
 * `aep run` planner path: read-only Planner profile, structured plan validation
 * with bounded retry, then await_plan_approval workflow state.
 */
export async function runTask(app: AepApplication, input: RunTaskInput): Promise<RunTaskResult> {
  const task = input.task.trim();
  if (task.length === 0) {
    throw new ApplicationError("invalid_task", "Task description must be non-empty");
  }

  const at = app.now();
  const runId = app.createId("run");
  const projectId = createProjectId(app.createId("proj"));
  const taskId = createTaskId(app.createId("task"));
  const workflowRunId = createWorkflowRunId(runId);
  const profile = createPlannerProfile();
  assertPlannerReadOnly(profile.tools);

  let aggregate = createInitialWorkflowAggregate({
    id: workflowRunId,
    taskId,
    projectId,
    createdAt: at,
  });

  const bootstrap: WorkflowEvent[] = [
    { type: "inspection_started", at },
    { type: "repository_inspected", at },
    { type: "planning_started", at },
  ];
  aggregate = reduceWorkflowAll(aggregate, bootstrap);

  const health = await app.runtime.checkAvailability();
  if (!health.ok || !health.sandboxReady) {
    throw new ApplicationError("runtime_unavailable", `Agent runtime not ready: ${health.detail}`);
  }

  const catalogCache = new ModelCatalogCache();
  let selection: ModelSelectionResult;
  try {
    const catalog = await catalogCache.refresh(() => app.runtime.discoverModels());
    selection = resolveModelForRole({
      roleId: "planner",
      catalog,
      config: { roles: [] },
    });
  } catch (error) {
    if (error instanceof ModelRoutingError) {
      throw new ApplicationError(error.code, error.message);
    }
    throw error;
  }

  const projectContext = gatherPlannerProjectContext(input.cwd);
  const userPrompt = buildPlannerUserPrompt({ task, projectContext });

  let activeExecutionId = app.createId("exec");
  let checkpointSaved = false;

  const parsed = await parsePlannerPlanWithBoundedRetry({
    runtime: app.runtime,
    maxAttempts: 2,
    start: async () => {
      const handle = await app.runtime.startExecution({
        executionId: activeExecutionId,
        roleId: "planner",
        prompt: userPrompt,
        modelId: selection.modelId,
        cwd: input.cwd,
        tools: profile.tools,
        sandbox: { enabled: true },
        systemPrompt: profile.systemPrompt,
        catalogSnapshotId: selection.catalogSnapshotId,
        ...(selection.modelParams.length === 0 ? {} : { modelParams: selection.modelParams }),
      });
      const startedAt = app.now();
      const execution: ExecutionSnapshot = {
        executionId: activeExecutionId,
        opaqueAgentId: handle.agentId,
        roleId: "planner",
        modelId: selection.modelId,
        cwd: input.cwd,
        tools: profile.tools,
        systemPrompt: profile.systemPrompt,
        startedAt,
        catalogSnapshotId: selection.catalogSnapshotId,
        modelSelectionRationale: selection.rationale,
        ...(selection.modelParams.length === 0 ? {} : { modelParams: selection.modelParams }),
      };
      const checkpoint: StoredRun = {
        runId,
        taskDescription: task,
        aggregate,
        executionLifecycle: "running",
        execution,
        executionId: activeExecutionId,
        agentId: handle.agentId,
        createdAt: at,
        updatedAt: startedAt,
      };
      app.runs.save(checkpoint);
      checkpointSaved = true;
      return handle;
    },
    retry: async (issues) => {
      activeExecutionId = app.createId("exec");
      const handle = await app.runtime.startExecution({
        executionId: activeExecutionId,
        roleId: "planner",
        prompt: buildPlanRepairPrompt(task, issues),
        modelId: selection.modelId,
        cwd: input.cwd,
        tools: profile.tools,
        sandbox: { enabled: true },
        systemPrompt: profile.systemPrompt,
        catalogSnapshotId: selection.catalogSnapshotId,
        ...(selection.modelParams.length === 0 ? {} : { modelParams: selection.modelParams }),
      });
      const startedAt = app.now();
      const execution: ExecutionSnapshot = {
        executionId: activeExecutionId,
        opaqueAgentId: handle.agentId,
        roleId: "planner",
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
        runId,
        taskDescription: task,
        aggregate,
        executionLifecycle: "running",
        execution,
        executionId: activeExecutionId,
        agentId: handle.agentId,
        createdAt: at,
        updatedAt: startedAt,
      });
      checkpointSaved = true;
      return handle;
    },
  });

  const usageObservedAt = app.now();
  const usage = await app.runtime.getUsage(activeExecutionId);
  app.usage.save({
    id: app.createId("usage"),
    executionId: activeExecutionId,
    roleId: "planner",
    modelId: selection.modelId,
    catalogSnapshotId: selection.catalogSnapshotId,
    usage,
    source: "cursor_sdk_get_usage",
    observedAt: usageObservedAt,
  });

  if (!parsed.ok) {
    throw new ApplicationError(
      "invalid_planner_plan",
      `Planner plan invalid after ${parsed.attempts} attempt(s): ${parsed.lastIssues.join("; ")}`,
    );
  }

  if (!checkpointSaved) {
    throw new ApplicationError("internal_error", "Planner checkpoint was not saved");
  }

  const policy = evaluateRiskPolicy(
    classifyRisk({
      taskDescription: task,
      touchedPaths: parsed.plan.touchedPaths,
      mayTouchSecretsOrAuth: parsed.plan.approvalFlags.mayTouchSecretsOrAuth,
      mayNeedNetwork: parsed.plan.approvalFlags.mayNeedNetwork,
    }),
  );

  const workflowEvents: WorkflowEvent[] = [
    { type: "agent_execution_started", at: app.now(), roleId: "planner" },
    { type: "agent_execution_completed", at: app.now(), roleId: "planner" },
    { type: "plan_proposed", at: app.now() },
  ];
  if (policy.verdict.decision === "deny" || !policy.requirements.allowAgentWriteExecution) {
    workflowEvents.push({
      type: "policy_violation_detected",
      at: app.now(),
      reason: policy.verdict.reason,
    });
  }
  aggregate = reduceWorkflowAll(aggregate, workflowEvents);

  const stored = app.runs.get(runId);
  const execution = stored?.execution;
  const next: StoredRun = {
    runId,
    taskDescription: task,
    aggregate,
    executionLifecycle: "settled",
    ...(execution === undefined ? {} : { execution }),
    executionId: parsed.executionId,
    agentId: parsed.agentId,
    lastResultText: parsed.rawText,
    plan: parsed.plan,
    plannerProfileVersionHash: profile.profileVersionHash,
    planSchemaVersion: profile.schemaVersion,
    policy,
    createdAt: at,
    updatedAt: app.now(),
  };
  app.runs.save(next);

  return {
    runId,
    executionId: parsed.executionId,
    agentId: parsed.agentId,
    status: aggregate.run.status,
    resultText: parsed.rawText,
    plan: parsed.plan,
    plannerProfileVersionHash: profile.profileVersionHash,
    planSchemaVersion: profile.schemaVersion,
    policy,
  };
}
