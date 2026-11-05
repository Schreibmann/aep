import { createApp } from "@aep/application";
import {
  createInitialWorkflowAggregate,
  createProjectId,
  createTaskId,
  createWorkflowRunId,
} from "@aep/domain";
import { afterEach, describe, expect, it } from "vitest";
import { assertSafeBindHost } from "../src/bind.ts";
import { LocalApiError } from "../src/errors.ts";
import {
  createLocalApiAuth,
  createLocalApiServer,
  generateLocalApiToken,
  isLoopbackHost,
  projectRunTimeline,
} from "../src/index.ts";

const servers: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server !== undefined) {
      await server.close();
    }
  }
});

describe("AEP-070 local API", () => {
  it("allows only loopback bind by default", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(() => assertSafeBindHost({ host: "0.0.0.0", port: 7432, allowLan: false })).toThrow(
      LocalApiError,
    );
    expect(() => assertSafeBindHost({ host: "0.0.0.0", port: 7432, allowLan: true })).not.toThrow();
  });

  it("requires bearer auth and serves runs/events/approvals/models/usage/worktrees", async () => {
    const token = generateLocalApiToken();
    const app = createApp();
    const at = "2026-11-05T00:00:00.000Z";
    const runId = "run_api_1";
    app.runs.save({
      runId,
      taskDescription: "Ship local API",
      aggregate: createInitialWorkflowAggregate({
        id: createWorkflowRunId(runId),
        taskId: createTaskId("task_1"),
        projectId: createProjectId("proj_1"),
        createdAt: at,
      }),
      executionLifecycle: "idle",
      pendingApproval: {
        kind: "plan",
        subjectHash: "a".repeat(64),
        scope: "plan",
        createdAt: at,
      },
      worktreePath: "C:/tmp/wt",
      worktreeBranch: "aep/task",
      createdAt: at,
      updatedAt: at,
    });

    const api = createLocalApiServer({
      app,
      auth: createLocalApiAuth(token),
      host: "127.0.0.1",
      port: 0,
    });
    servers.push(api);
    await api.listen();
    const address = api.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    const base = `http://127.0.0.1:${address.port}`;

    const unauth = await fetch(`${base}/runs`);
    expect(unauth.status).toBe(401);

    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);

    const headers = { authorization: `Bearer ${token}` };
    const runs = await fetch(`${base}/runs`, { headers });
    expect(runs.status).toBe(200);
    const runsBody: unknown = await runs.json();
    expect(runsBody).toMatchObject({ runs: [{ runId }] });

    const events = await fetch(`${base}/runs/${runId}/events`, { headers });
    expect(events.status).toBe(200);
    const eventsBody: unknown = await events.json();
    expect(eventsBody).toMatchObject({ runId });

    const approvals = await fetch(`${base}/approvals`, { headers });
    expect(approvals.status).toBe(200);

    const models = await fetch(`${base}/models`, { headers });
    expect(models.status).toBe(200);

    const usage = await fetch(`${base}/usage`, { headers });
    expect(usage.status).toBe(200);

    const worktrees = await fetch(`${base}/worktrees`, { headers });
    expect(worktrees.status).toBe(200);
    const wtBody: unknown = await worktrees.json();
    expect(wtBody).toMatchObject({ worktrees: [{ runId, path: "C:/tmp/wt" }] });
  });

  it("projects timeline without secrets", () => {
    const at = "2026-11-05T00:00:00.000Z";
    const events = projectRunTimeline({
      runId: "run_x",
      taskDescription: "token sk-abcdefghijklmnopqrstuvwxyz123456",
      aggregate: createInitialWorkflowAggregate({
        id: createWorkflowRunId("run_x"),
        taskId: createTaskId("t"),
        projectId: createProjectId("p"),
        createdAt: at,
      }),
      executionLifecycle: "idle",
      createdAt: at,
      updatedAt: at,
    });
    expect(events.some((event) => event.text.includes("sk-[REDACTED]"))).toBe(true);
    expect(events.every((event) => !event.text.includes("sk-abcdefgh"))).toBe(true);
  });
});
