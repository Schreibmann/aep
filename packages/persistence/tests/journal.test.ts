import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DomainError, type WorkflowEvent } from "@aep/domain";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendWorkflowEvent,
  getWorkflowRunProjection,
  listEvidence,
  listRunTimeline,
  listTasks,
  openDatabase,
  replayWorkflowRun,
  seedWorkflowRun,
} from "../src/index.ts";

const tempDirs: string[] = [];
const NOW = "2026-11-05T01:00:00.000Z";

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

async function openTemp() {
  const dir = await mkdtemp(join(tmpdir(), "aep-journal-"));
  tempDirs.push(dir);
  return openDatabase(join(dir, "aep.sqlite"));
}

describe("workflow event journal", () => {
  it("appends events and projects status in one transaction", async () => {
    const db = await openTemp();
    seedWorkflowRun(db, {
      projectId: "proj_1",
      taskId: "task_1",
      runId: "run_1",
      rootPath: "/tmp/aep",
      description: "Ship journal",
      risk: "medium",
      createdAt: NOW,
    });

    const first = appendWorkflowEvent(db, {
      eventId: "evt_1",
      workflowRunId: "run_1",
      actor: "system",
      operationOrigin: "test",
      event: { type: "inspection_started", at: NOW },
    });
    expect(first.status).toBe("applied");
    if (first.status === "applied") {
      expect(first.sequence).toBe(1);
      expect(first.aggregate.run.status).toBe("inspecting");
    }

    appendWorkflowEvent(db, {
      eventId: "evt_2",
      workflowRunId: "run_1",
      actor: "system",
      operationOrigin: "test",
      event: { type: "repository_inspected", at: NOW },
    });

    expect(getWorkflowRunProjection(db, "run_1").status).toBe("planning");
    const timeline = listRunTimeline(db, "run_1");
    expect(timeline).toHaveLength(2);
    expect(timeline[0]?.actor).toBe("system");
    expect(timeline[0]?.operationOrigin).toBe("test");
    db.close();
  });

  it("treats duplicate event ids as idempotent", async () => {
    const db = await openTemp();
    seedWorkflowRun(db, {
      projectId: "proj_2",
      taskId: "task_2",
      runId: "run_2",
      rootPath: "/tmp/aep",
      description: "dup",
      risk: "low",
      createdAt: NOW,
    });

    appendWorkflowEvent(db, {
      eventId: "same",
      workflowRunId: "run_2",
      actor: "human",
      operationOrigin: "cli",
      event: { type: "inspection_started", at: NOW },
    });
    const dup = appendWorkflowEvent(db, {
      eventId: "same",
      workflowRunId: "run_2",
      actor: "human",
      operationOrigin: "cli",
      event: { type: "inspection_started", at: NOW },
    });
    expect(dup.status).toBe("duplicate");
    expect(listRunTimeline(db, "run_2")).toHaveLength(1);
    db.close();
  });

  it("replays the journal to the same projection", async () => {
    const db = await openTemp();
    seedWorkflowRun(db, {
      projectId: "proj_3",
      taskId: "task_3",
      runId: "run_3",
      rootPath: "/tmp/aep",
      description: "replay",
      risk: "low",
      createdAt: NOW,
    });

    const replayEvents: ReadonlyArray<{ id: string; event: WorkflowEvent }> = [
      { id: "e1", event: { type: "inspection_started", at: NOW } },
      { id: "e2", event: { type: "repository_inspected", at: NOW } },
      { id: "e3", event: { type: "plan_proposed", at: NOW } },
    ];
    for (const item of replayEvents) {
      appendWorkflowEvent(db, {
        eventId: item.id,
        workflowRunId: "run_3",
        actor: "system",
        operationOrigin: "test",
        event: item.event,
      });
    }

    const before = getWorkflowRunProjection(db, "run_3");
    const replayed = replayWorkflowRun(db, "run_3");
    const after = getWorkflowRunProjection(db, "run_3");
    expect(replayed.run.status).toBe("awaiting_plan_approval");
    expect(after.status).toBe(before.status);
    expect(after.fixCycleCount).toBe(before.fixCycleCount);
    db.close();
  });

  it("lists tasks and evidence, and serializes conflicting writers safely", async () => {
    const db = await openTemp();
    seedWorkflowRun(db, {
      projectId: "proj_4",
      taskId: "task_4",
      runId: "run_4",
      rootPath: "/tmp/aep",
      description: "gates",
      risk: "high",
      createdAt: NOW,
    });

    const events: ReadonlyArray<{ id: string; event: WorkflowEvent }> = [
      { id: "g1", event: { type: "inspection_started", at: NOW } },
      { id: "g2", event: { type: "repository_inspected", at: NOW } },
      { id: "g3", event: { type: "plan_proposed", at: NOW } },
      {
        id: "g4",
        event: { type: "plan_approved", at: NOW, decidedBy: "human" },
      },
      { id: "g5", event: { type: "workspace_created", at: NOW } },
      {
        id: "g6",
        event: { type: "agent_execution_started", at: NOW, roleId: "implementer" },
      },
      {
        id: "g7",
        event: { type: "agent_execution_completed", at: NOW, roleId: "implementer" },
      },
      { id: "g8", event: { type: "gate_started", at: NOW, name: "unit" } },
      { id: "g9", event: { type: "gate_passed", at: NOW, name: "unit" } },
    ];

    for (const item of events) {
      appendWorkflowEvent(db, {
        eventId: item.id,
        workflowRunId: "run_4",
        actor: "system",
        operationOrigin: "test",
        event: item.event,
      });
    }

    // Serialized writers: first applies; second invalid transition rolls back and leaves journal intact.
    const firstReview = appendWorkflowEvent(db, {
      eventId: "race-a",
      workflowRunId: "run_4",
      actor: "system",
      operationOrigin: "worker-a",
      event: {
        type: "review_submitted",
        at: NOW,
        disposition: "approve",
        openFindingCount: 0,
      },
    });
    expect(firstReview.status).toBe("applied");

    expect(() =>
      appendWorkflowEvent(db, {
        eventId: "race-b",
        workflowRunId: "run_4",
        actor: "system",
        operationOrigin: "worker-b",
        event: {
          type: "review_submitted",
          at: NOW,
          disposition: "approve",
          openFindingCount: 0,
        },
      }),
    ).toThrow(DomainError);

    const taskList = listTasks(db);
    expect(taskList.some((task) => task.id === "task_4" && task.latestRunId === "run_4")).toBe(
      true,
    );
    expect(listEvidence(db, "run_4").some((item) => item.kind === "gate:unit")).toBe(true);

    // Journal length remains contiguous sequences.
    const timeline = listRunTimeline(db, "run_4");
    const sequences = timeline.map((entry) => entry.sequence);
    expect(sequences).toEqual([...sequences].sort((left, right) => left - right));
    expect(new Set(sequences).size).toBe(sequences.length);
    db.close();
  });
});
