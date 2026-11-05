import { describe, expect, it } from "vitest";
import {
  createPolicyVerdict,
  createProject,
  createProjectId,
  createRoleExecutionId,
  createTask,
  createTaskId,
  createUsageRecord,
  createUsageRecordId,
  createWorkflowRun,
  createWorkflowRunId,
  DomainError,
  isTerminalWorkflowRunStatus,
  withWorkflowRunStatus,
} from "../src/index.ts";

const NOW = "2026-11-04T20:00:00.000Z";

describe("@aep/domain constructors", () => {
  it("creates valid project/task/run aggregates", () => {
    const projectId = createProjectId("proj_1");
    const taskId = createTaskId("task_1");
    const runId = createWorkflowRunId("run_1");

    const project = createProject({
      id: projectId,
      rootPath: "C:/WORK/MY/aep",
      createdAt: NOW,
    });
    const task = createTask({
      id: taskId,
      projectId,
      description: "Fix registration race",
      risk: "medium",
      createdAt: NOW,
    });
    const run = createWorkflowRun({
      id: runId,
      taskId,
      projectId,
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(project.rootPath).toContain("aep");
    expect(task.risk).toBe("medium");
    expect(run.status).toBe("created");
    expect(isTerminalWorkflowRunStatus(run.status)).toBe(false);
  });

  it("rejects empty identifiers and blank descriptions", () => {
    expect(() => createProjectId("  ")).toThrow(DomainError);
    expect(() =>
      createTask({
        id: createTaskId("task_2"),
        projectId: createProjectId("proj_2"),
        description: " ",
        risk: "low",
        createdAt: NOW,
      }),
    ).toThrow(/Task.description/);
  });

  it("rejects mutating a terminal workflow run", () => {
    const run = createWorkflowRun({
      id: createWorkflowRunId("run_term"),
      taskId: createTaskId("task_term"),
      projectId: createProjectId("proj_term"),
      status: "completed",
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(() => withWorkflowRunStatus(run, "implementing", NOW)).toThrow(/terminal/);
  });

  it("rejects allowing critical risk without approval path", () => {
    expect(() =>
      createPolicyVerdict({
        decision: "allow",
        risk: "critical",
        reason: "should fail",
      }),
    ).toThrow(/Critical risk/);
  });

  it("stores unknown cost without inventing zero dollars", () => {
    const usage = createUsageRecord({
      id: createUsageRecordId("usage_1"),
      workflowRunId: createWorkflowRunId("run_usage"),
      roleExecutionId: createRoleExecutionId("role_usage"),
      costStatus: "unknown",
      inputTokens: 12,
      createdAt: NOW,
    });
    expect(usage.costStatus).toBe("unknown");
    expect(usage.inputTokens).toBe(12);
    expect(usage.outputTokens).toBeUndefined();
  });

  it("rejects negative token counts", () => {
    expect(() =>
      createUsageRecord({
        id: createUsageRecordId("usage_bad"),
        workflowRunId: createWorkflowRunId("run_bad"),
        roleExecutionId: createRoleExecutionId("role_bad"),
        costStatus: "unknown",
        inputTokens: -1,
        createdAt: NOW,
      }),
    ).toThrow(/inputTokens/);
  });
});
