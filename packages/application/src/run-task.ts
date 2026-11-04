import {
  createInitialWorkflowAggregate,
  createProjectId,
  createTaskId,
  createWorkflowRunId,
  reduceWorkflowAll,
  type WorkflowEvent,
} from "@aep/domain";
import type { AepApplication } from "./create-app.js";
import { ApplicationError } from "./errors.js";
import type { StoredRun } from "./run-store.js";

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
};

/**
 * Skeleton `aep run`: advances a workflow aggregate through plan approval
 * placeholders and executes one FakeAgentRuntime planner session.
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

  const catalog = await app.runtime.discoverModels();
  const model = catalog.models[0];
  if (model === undefined) {
    throw new ApplicationError("no_models", "Runtime model catalog is empty");
  }

  const executionId = app.createId("exec");
  const handle = await app.runtime.startExecution({
    executionId,
    roleId: "planner",
    prompt: task,
    modelId: model.id,
    cwd: input.cwd,
    tools: {
      tools: ["read", "grep", "glob", "ls"],
      disallowedTools: ["shell", "edit", "mcp", "task"],
    },
    sandbox: { enabled: true },
  });

  const result = await handle.wait();
  if (result.status === "failed") {
    throw new ApplicationError(
      result.code ?? "execution_failed",
      result.safeMessage ?? "Agent execution failed",
    );
  }
  if (result.status === "cancelled") {
    throw new ApplicationError("execution_cancelled", "Agent execution was cancelled");
  }

  aggregate = reduceWorkflowAll(aggregate, [
    { type: "agent_execution_started", at: app.now(), roleId: "planner" },
    { type: "agent_execution_completed", at: app.now(), roleId: "planner" },
    { type: "plan_proposed", at: app.now() },
  ]);

  const stored: StoredRun = {
    runId,
    taskDescription: task,
    aggregate,
    executionId,
    agentId: handle.agentId,
    ...(result.resultText === undefined ? {} : { lastResultText: result.resultText }),
    createdAt: at,
    updatedAt: app.now(),
  };
  app.runs.save(stored);

  return {
    runId,
    executionId,
    agentId: handle.agentId,
    status: aggregate.run.status,
    ...(result.resultText === undefined ? {} : { resultText: result.resultText }),
  };
}
