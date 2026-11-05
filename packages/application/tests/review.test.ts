import { FakeAgentRuntime } from "@aep/runtime-contracts";
import { describe, expect, it } from "vitest";
import { createApp, runReview, runTask } from "../src/index.js";

const approveReport = JSON.stringify({
  verdict: "approve",
  assurance: "same_model_fresh_session",
  findings: [],
  summary: "No blocking issues",
});

describe("AEP-054 application reviewer", () => {
  it("runs a fresh reviewer session with distinct agentId and records assurance", async () => {
    let n = 0;
    let execCount = 0;
    const runtime = new FakeAgentRuntime({
      scripts: {
        exec_plan: {
          events: [
            {
              type: "started",
              executionId: "exec_plan",
              agentId: "agent_planner",
              runId: "sdk_plan",
            },
            {
              type: "completed",
              executionId: "exec_plan",
              resultText: JSON.stringify({
                objective: "Fix helper",
                summary: "small fix",
                assumptions: [],
                touchedPaths: ["src/helper.ts"],
                steps: [{ id: "s1", description: "patch", paths: ["src/helper.ts"] }],
                risks: [],
                gates: [{ id: "lint", commandHint: "pnpm lint", required: true }],
                validationCommands: ["pnpm test"],
                estimate: { complexity: "low" },
                approvalFlags: {
                  requiresHumanApprovalBeforeWrite: true,
                  mayTouchSecretsOrAuth: false,
                  mayNeedNetwork: false,
                },
              }),
            },
          ],
          result: {
            executionId: "exec_plan",
            status: "completed",
            resultText: JSON.stringify({
              objective: "Fix helper",
              summary: "small fix",
              assumptions: [],
              touchedPaths: ["src/helper.ts"],
              steps: [{ id: "s1", description: "patch", paths: ["src/helper.ts"] }],
              risks: [],
              gates: [{ id: "lint", commandHint: "pnpm lint", required: true }],
              validationCommands: ["pnpm test"],
              estimate: { complexity: "low" },
              approvalFlags: {
                requiresHumanApprovalBeforeWrite: true,
                mayTouchSecretsOrAuth: false,
                mayNeedNetwork: false,
              },
            }),
          },
          usage: { status: "unknown", costStatus: "unknown", tokens: {} },
        },
        exec_review: {
          events: [
            {
              type: "started",
              executionId: "exec_review",
              agentId: "agent_reviewer",
              runId: "sdk_review",
            },
            { type: "completed", executionId: "exec_review", resultText: approveReport },
          ],
          result: {
            executionId: "exec_review",
            status: "completed",
            resultText: approveReport,
          },
          usage: { status: "unknown", costStatus: "unknown", tokens: {} },
        },
      },
    });

    const app = createApp({
      runtime,
      now: () => "2026-11-05T18:00:00.000Z",
      createId: (prefix) => {
        if (prefix === "exec") {
          execCount += 1;
          return execCount === 1 ? "exec_plan" : "exec_review";
        }
        n += 1;
        return `${prefix}_${n}`;
      },
    });

    const planned = await runTask(app, { task: "Fix helper", cwd: process.cwd() });
    expect(planned.agentId).toBe("agent_planner");

    const reviewed = await runReview(app, {
      runId: planned.runId,
      cwd: process.cwd(),
      implementerModelId: "fake-model",
    });

    expect(reviewed.agentId).toBe("agent_reviewer");
    expect(reviewed.agentId).not.toBe(planned.agentId);
    expect(reviewed.reviewAssurance).toBe("same_model_fresh_session");
    expect(reviewed.report.verdict).toBe("approve");
    expect(app.runs.get(planned.runId)?.reviewReport?.summary).toContain("No blocking");
    expect(app.runs.get(planned.runId)?.execution?.contextReset).toBe(true);
  });
});
