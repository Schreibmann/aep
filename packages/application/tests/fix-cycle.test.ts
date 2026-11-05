import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createInitialWorkflowAggregate,
  createProjectId,
  createTaskId,
  createWorkflowRunId,
  reduceWorkflowAll,
} from "@aep/domain";
import type { RunCommandInput, RunCommandResult } from "@aep/process";
import { FakeAgentRuntime } from "@aep/runtime-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, runBoundedFixCycle } from "../src/index.ts";
import { findOutOfScopePaths } from "../src/scope-check.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

const plan = {
  objective: "Fix helper",
  summary: "patch helper",
  assumptions: [],
  touchedPaths: ["src/helper.ts"],
  steps: [{ id: "s1", description: "patch", paths: ["src/helper.ts"] }],
  risks: [],
  gates: [{ id: "lint", commandHint: "pnpm lint", required: true }],
  validationCommands: ["pnpm lint"],
  estimate: { complexity: "low" as const },
  approvalFlags: {
    requiresHumanApprovalBeforeWrite: true,
    mayTouchSecretsOrAuth: false,
    mayNeedNetwork: false,
  },
};

const blockingReview = {
  verdict: "request_changes" as const,
  assurance: "same_model_fresh_session" as const,
  summary: "blocking bug",
  findings: [
    {
      id: "f1",
      severity: "high" as const,
      category: "bug" as const,
      file: "src/helper.ts",
      line: 4,
      title: "Bug",
      evidence: "null deref",
      confidence: "high" as const,
    },
  ],
};

const approveReview = {
  verdict: "approve" as const,
  assurance: "same_model_fresh_session" as const,
  summary: "fixed",
  findings: [] as const,
};

describe("AEP-055 bounded fix cycle", () => {
  it("flags out-of-scope paths", () => {
    expect(findOutOfScopePaths(["src/helper.ts"], ["src/helper.ts"])).toEqual([]);
    expect(findOutOfScopePaths(["src/other.ts"], ["src/helper.ts"])).toEqual(["src/other.ts"]);
  });

  it("stops on scope expansion without unbounded looping", async () => {
    const runtime = new FakeAgentRuntime({
      defaultScript: {
        events: [],
        result: { executionId: "x", status: "completed", resultText: "ok" },
        usage: { status: "unknown", costStatus: "unknown", tokens: {} },
      },
    });
    const app = createApp({
      runtime,
      now: () => "2026-11-05T19:00:00.000Z",
      createId: (prefix) => `${prefix}_fx`,
    });

    const at = "2026-11-05T19:00:00.000Z";
    let aggregate = createInitialWorkflowAggregate({
      id: createWorkflowRunId("run_fx"),
      taskId: createTaskId("task_fx"),
      projectId: createProjectId("proj_fx"),
      createdAt: at,
    });
    aggregate = reduceWorkflowAll(aggregate, [
      { type: "inspection_started", at },
      { type: "repository_inspected", at },
      { type: "planning_started", at },
      { type: "plan_proposed", at },
      { type: "plan_approved", at, decidedBy: "tester" },
      { type: "workspace_created", at },
      { type: "agent_execution_started", at, roleId: "implementer" },
      { type: "agent_execution_completed", at, roleId: "implementer" },
      { type: "gate_started", at, name: "lint" },
      { type: "gate_passed", at, name: "lint" },
      {
        type: "review_submitted",
        at,
        disposition: "request_changes",
        openFindingCount: 1,
      },
    ]);

    app.runs.save({
      runId: "run_fx",
      taskDescription: "Fix helper",
      aggregate,
      executionLifecycle: "settled",
      plan,
      reviewReport: blockingReview,
      reviewAssurance: "same_model_fresh_session",
      createdAt: at,
      updatedAt: at,
    });

    const report = await runBoundedFixCycle(app, {
      runId: "run_fx",
      cwd: process.cwd(),
      changedPathsThisCycle: ["src/secret-other.ts"],
    });
    expect(report.stopReason).toBe("scope_expansion");
    expect(report.cyclesRun).toBe(1);
    expect(report.unfixedFindings[0]?.id).toBe("f1");
  });

  it("runs one fix cycle then approves when reviewer clears findings", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aep-fix-"));
    tempDirs.push(dir);
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "demo", scripts: { lint: "echo lint" } }),
      "utf8",
    );
    await writeFile(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");

    let execN = 0;
    const runtime = new FakeAgentRuntime({
      scripts: {
        exec_impl: {
          events: [
            {
              type: "started",
              executionId: "exec_impl",
              agentId: "agent_impl",
              runId: "sdk_impl",
            },
            { type: "completed", executionId: "exec_impl", resultText: "fixed" },
          ],
          result: { executionId: "exec_impl", status: "completed", resultText: "fixed" },
          usage: { status: "unknown", costStatus: "unknown", tokens: {} },
        },
        exec_rev: {
          events: [
            {
              type: "started",
              executionId: "exec_rev",
              agentId: "agent_rev",
              runId: "sdk_rev",
            },
            {
              type: "completed",
              executionId: "exec_rev",
              resultText: JSON.stringify(approveReview),
            },
          ],
          result: {
            executionId: "exec_rev",
            status: "completed",
            resultText: JSON.stringify(approveReview),
          },
          usage: { status: "unknown", costStatus: "unknown", tokens: {} },
        },
      },
    });

    const app = createApp({
      runtime,
      now: () => "2026-11-05T19:10:00.000Z",
      createId: (prefix) => {
        if (prefix === "exec") {
          execN += 1;
          return execN === 1 ? "exec_impl" : "exec_rev";
        }
        return `${prefix}_${execN}`;
      },
    });

    const at = "2026-11-05T19:10:00.000Z";
    let aggregate = createInitialWorkflowAggregate({
      id: createWorkflowRunId("run_ok"),
      taskId: createTaskId("task_ok"),
      projectId: createProjectId("proj_ok"),
      createdAt: at,
    });
    aggregate = reduceWorkflowAll(aggregate, [
      { type: "inspection_started", at },
      { type: "repository_inspected", at },
      { type: "planning_started", at },
      { type: "plan_proposed", at },
      { type: "plan_approved", at, decidedBy: "tester" },
      { type: "workspace_created", at },
      { type: "agent_execution_started", at, roleId: "implementer" },
      { type: "agent_execution_completed", at, roleId: "implementer" },
      { type: "gate_started", at, name: "lint" },
      { type: "gate_passed", at, name: "lint" },
      {
        type: "review_submitted",
        at,
        disposition: "request_changes",
        openFindingCount: 1,
      },
    ]);

    app.runs.save({
      runId: "run_ok",
      taskDescription: "Fix helper",
      aggregate,
      executionLifecycle: "settled",
      plan,
      reviewReport: blockingReview,
      reviewAssurance: "same_model_fresh_session",
      agentId: "agent_prior",
      createdAt: at,
      updatedAt: at,
    });

    const gateRunner = {
      async run(cmd: RunCommandInput): Promise<RunCommandResult> {
        return {
          commandId: cmd.commandId,
          executable: cmd.commandId,
          argv: cmd.argv,
          cwd: cmd.cwd,
          exitCode: 0,
          signal: null,
          timedOut: false,
          durationMs: 1,
          stdout: "ok",
          stderr: "",
          stdoutTruncated: false,
          stderrTruncated: false,
        };
      },
    };

    const report = await runBoundedFixCycle(app, {
      runId: "run_ok",
      cwd: dir,
      changedPathsThisCycle: ["src/helper.ts"],
      gateRunner,
    });

    expect(report.stopReason).toBe("approved");
    expect(report.cyclesRun).toBe(1);
    expect(report.fixedFindingIds).toContain("f1");
    expect(report.unfixedFindings).toEqual([]);
  });
});
