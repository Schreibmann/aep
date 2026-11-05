import {
  createInitialWorkflowAggregate,
  createProjectId,
  createTaskId,
  createWorkflowRunId,
  reduceWorkflowAll,
} from "@aep/domain";
import { FakeAgentRuntime } from "@aep/runtime-contracts";
import { describe, expect, it } from "vitest";
import { type ApplicationError, createApp } from "../src/index.ts";
import { classifyRunForRecovery, listNonTerminalRuns, resumeRun } from "../src/recovery.ts";
import { InMemoryRunStore, type StoredRun } from "../src/run-store.ts";
import { runTask } from "../src/run-task.ts";

const NOW = "2026-11-05T12:00:00.000Z";

function seedRunningPlanner(input: {
  runId: string;
  opaqueAgentId: string | undefined;
  cwd?: string;
}): StoredRun {
  const at = NOW;
  let aggregate = createInitialWorkflowAggregate({
    id: createWorkflowRunId(input.runId),
    taskId: createTaskId("task_1"),
    projectId: createProjectId("proj_1"),
    createdAt: at,
  });
  aggregate = reduceWorkflowAll(aggregate, [
    { type: "inspection_started", at },
    { type: "repository_inspected", at },
    { type: "planning_started", at },
  ]);

  const opaqueAgentId = input.opaqueAgentId;
  const execution =
    opaqueAgentId === undefined
      ? undefined
      : {
          executionId: "exec_1",
          opaqueAgentId,
          roleId: "planner" as const,
          modelId: "fake-model",
          cwd: input.cwd ?? "/tmp/work",
          tools: {
            tools: ["read", "grep", "glob", "ls"],
            disallowedTools: ["shell", "edit", "mcp", "task"],
          },
          startedAt: at,
        };

  return {
    runId: input.runId,
    taskDescription: "recover me",
    aggregate,
    executionLifecycle: "running",
    ...(execution === undefined ? {} : { execution }),
    ...(execution === undefined ? {} : { executionId: execution.executionId }),
    ...(opaqueAgentId === undefined ? {} : { agentId: opaqueAgentId }),
    createdAt: at,
    updatedAt: at,
  };
}

describe("AEP-022 recovery", () => {
  it("classifies terminal, safely resumable, and uncertain runs", () => {
    const store = new InMemoryRunStore();
    const app = createApp({
      runs: store,
      now: () => NOW,
      createId: (prefix) => `${prefix}_x`,
    });

    // finish a normal run to terminal-ish awaiting_plan_approval (non-terminal but settled)
    // Use seeded running / uncertain instead for classification checks.
    const resumable = seedRunningPlanner({ runId: "run_ok", opaqueAgentId: "agent_1" });
    expect(classifyRunForRecovery(resumable).kind).toBe("safely_resumable");

    const uncertain = seedRunningPlanner({ runId: "run_bad", opaqueAgentId: undefined });
    expect(classifyRunForRecovery(uncertain).kind).toBe("uncertain");

    store.save(resumable);
    store.save(uncertain);
    expect(listNonTerminalRuns(app)).toHaveLength(2);
  });

  it("simulates process restart before agent completion and resumes with reapplied settings", async () => {
    const runtime = new FakeAgentRuntime({
      scripts: {
        exec_1: {
          holdWait: true,
          events: [
            {
              type: "started",
              executionId: "exec_1",
              agentId: "agent_crash",
              runId: "sdk_run_1",
            },
            { type: "assistant_text", executionId: "exec_1", text: "plan after resume" },
            { type: "completed", executionId: "exec_1", resultText: "plan after resume" },
          ],
          result: {
            executionId: "exec_1",
            status: "completed",
            resultText: "plan after resume",
          },
          usage: {
            status: "unknown",
            costStatus: "unknown",
            tokens: { inputTokens: 1, outputTokens: 1 },
          },
        },
      },
    });

    const store = new InMemoryRunStore();
    store.save(
      seedRunningPlanner({
        runId: "run_crash",
        opaqueAgentId: "agent_crash",
        cwd: "/tmp/aep-worktree",
      }),
    );

    // Process "restart": new app, same durable snapshot, same runtime process attachment surface.
    const restarted = createApp({
      runtime,
      runs: InMemoryRunStore.fromSnapshot(store.snapshot()),
      now: () => "2026-11-05T12:01:00.000Z",
      createId: (prefix) => `${prefix}_r`,
    });

    expect(listNonTerminalRuns(restarted).map((run) => run.runId)).toEqual(["run_crash"]);

    const result = await resumeRun(restarted, { runId: "run_crash" });
    expect(result.disposition).toBe("resumed");
    expect(result.status).toBe("awaiting_plan_approval");
    expect(runtime.wasResumed("exec_1")).toBe(true);

    const resumeInput = runtime.getLastResumeInput();
    expect(resumeInput?.opaqueAgentId).toBe("agent_crash");
    expect(resumeInput?.cwd).toBe("/tmp/aep-worktree");
    expect(resumeInput?.sandbox.enabled).toBe(true);
    expect(resumeInput?.tools.tools).toContain("read");
    expect(resumeInput?.tools.disallowedTools).toContain("shell");
    expect(resumeInput?.modelId).toBe("fake-model");

    // Second resume must not re-invoke the agent once lifecycle is settled.
    const again = await resumeRun(restarted, { runId: "run_crash" });
    expect(again.disposition).toBe("no_action");
    expect(again.classification).toBe("idle_non_terminal");
  });

  it("does not re-invoke resume when the run is already terminal", async () => {
    const runtime = new FakeAgentRuntime();
    const store = new InMemoryRunStore();
    const seed = seedRunningPlanner({ runId: "run_term", opaqueAgentId: "agent_t" });
    // Force terminal interrupted projection
    const interrupted = {
      ...seed,
      aggregate: reduceWorkflowAll(seed.aggregate, [{ type: "run_interrupted" as const, at: NOW }]),
      executionLifecycle: "settled" as const,
    };
    store.save(interrupted);

    const app = createApp({ runtime, runs: store, now: () => NOW });
    const result = await resumeRun(app, { runId: "run_term" });
    expect(result.disposition).toBe("already_terminal");
    expect(result.status).toBe("interrupted");
    expect(runtime.wasResumed("exec_1")).toBe(false);
  });

  it("requires explicit confirmation for uncertain recovery and can mark interrupted", async () => {
    const store = new InMemoryRunStore();
    store.save(seedRunningPlanner({ runId: "run_uncertain", opaqueAgentId: undefined }));
    const app = createApp({ runs: store, now: () => NOW });

    await expect(resumeRun(app, { runId: "run_uncertain" })).rejects.toMatchObject({
      code: "uncertain_recovery_requires_confirmation",
    } satisfies Partial<ApplicationError>);

    const marked = await resumeRun(app, {
      runId: "run_uncertain",
      markInterrupted: true,
    });
    expect(marked.disposition).toBe("marked_interrupted");
    expect(marked.status).toBe("interrupted");
  });

  it("confirm-uncertain policy marks interrupted without inventing a duplicate agent run", async () => {
    const runtime = new FakeAgentRuntime();
    const store = new InMemoryRunStore();
    store.save(seedRunningPlanner({ runId: "run_policy", opaqueAgentId: undefined }));
    const app = createApp({ runtime, runs: store, now: () => NOW });

    const result = await resumeRun(app, {
      runId: "run_policy",
      confirmUncertainRetry: true,
    });
    expect(result.disposition).toBe("marked_interrupted");
    expect(runtime.wasResumed("exec_1")).toBe(false);
  });

  it("simulates restart after agent completion checkpointed as running then resumes once", async () => {
    const runtime = new FakeAgentRuntime();
    const live = createApp({
      runtime,
      now: () => NOW,
      createId: (prefix) => `${prefix}_1`,
    });

    // Complete normally — store settled
    const finished = await runTask(live, { task: "done task", cwd: "/tmp/x" });
    expect(finished.status).toBe("awaiting_plan_approval");

    // Simulate crash after agent completed but before AEP persisted: rewind lifecycle to running
    const stored = live.runs.get(finished.runId);
    expect(stored).toBeDefined();
    if (stored === undefined) {
      throw new Error("expected stored run");
    }
    const crashed: StoredRun = {
      runId: stored.runId,
      taskDescription: stored.taskDescription,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
      aggregate: reduceWorkflowAll(
        createInitialWorkflowAggregate({
          id: stored.aggregate.run.id,
          taskId: stored.aggregate.run.taskId,
          projectId: stored.aggregate.run.projectId,
          createdAt: stored.createdAt,
        }),
        [
          { type: "inspection_started", at: NOW },
          { type: "repository_inspected", at: NOW },
          { type: "planning_started", at: NOW },
        ],
      ),
      executionLifecycle: "running",
      ...(stored.execution === undefined ? {} : { execution: stored.execution }),
      ...(stored.executionId === undefined ? {} : { executionId: stored.executionId }),
      ...(stored.agentId === undefined ? {} : { agentId: stored.agentId }),
    };
    const snapshot = InMemoryRunStore.fromSnapshot([crashed]);
    const restarted = createApp({
      runtime,
      runs: snapshot,
      now: () => "2026-11-05T13:00:00.000Z",
    });

    const resumed = await resumeRun(restarted, { runId: finished.runId });
    expect(resumed.disposition).toBe("resumed");
    expect(resumed.status).toBe("awaiting_plan_approval");
    // Must not claim workflow completed without evidence
    expect(resumed.status).not.toBe("completed");
  });

  it("cancels a safely resumable run on request", async () => {
    const runtime = new FakeAgentRuntime();
    const store = new InMemoryRunStore();
    store.save(seedRunningPlanner({ runId: "run_cancel", opaqueAgentId: "agent_c" }));
    const app = createApp({ runtime, runs: store, now: () => NOW });
    const result = await resumeRun(app, { runId: "run_cancel", cancel: true });
    expect(result.disposition).toBe("cancelled");
    expect(result.status).toBe("cancelled");
    expect(runtime.wasCancelled("exec_1")).toBe(true);
  });
});
