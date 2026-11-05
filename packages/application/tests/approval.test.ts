import { describe, expect, it } from "vitest";
import {
  ApplicationError,
  createApp,
  decidePlanApproval,
  requireExplicitApprovalDecision,
  runTask,
} from "../src/index.js";

describe("AEP-052 human approval service", () => {
  it("approves a plan bound to the plan hash and advances workflow", async () => {
    const app = createApp({
      now: () => "2026-11-05T16:00:00.000Z",
      createId: (prefix) => `${prefix}_a`,
    });
    const run = await runTask(app, { task: "Add a small helper", cwd: process.cwd() });
    expect(run.status).toBe("awaiting_plan_approval");
    expect(app.runs.get(run.runId)?.pendingApproval?.kind).toBe("plan");

    const decided = decidePlanApproval(app, {
      runId: run.runId,
      decision: "allow",
      decidedBy: "maintainer",
      rationale: "Looks good",
    });
    expect(decided.status).toBe("preparing_workspace");
    expect(decided.approval.subjectHash).toBe(app.runs.get(run.runId)?.approvals?.[0]?.subjectHash);
    expect(app.runs.get(run.runId)?.pendingApproval).toBeUndefined();
  });

  it("rejects replay when the plan hash changed", async () => {
    const app = createApp({
      now: () => "2026-11-05T16:00:00.000Z",
      createId: (prefix) => `${prefix}_b`,
    });
    const run = await runTask(app, { task: "Tweak docs", cwd: process.cwd() });
    const stored = app.runs.get(run.runId);
    if (stored === undefined || stored.plan === undefined || stored.pendingApproval === undefined) {
      throw new Error("expected plan and pending approval");
    }

    app.runs.save({
      ...stored,
      plan: {
        ...stored.plan,
        summary: "mutated after pending approval was issued",
      },
    });

    expect(() =>
      decidePlanApproval(app, {
        runId: run.runId,
        decision: "allow",
        decidedBy: "maintainer",
        rationale: "stale",
      }),
    ).toThrow(ApplicationError);

    try {
      decidePlanApproval(app, {
        runId: run.runId,
        decision: "allow",
        decidedBy: "maintainer",
        rationale: "stale",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      if (error instanceof ApplicationError) {
        expect(error.code).toBe("approval_subject_mismatch");
      }
    }
  });

  it("blocks non-interactive mode without an explicit decision", () => {
    expect(() => requireExplicitApprovalDecision(false)).toThrow(ApplicationError);
    expect(() => requireExplicitApprovalDecision(true)).not.toThrow();
  });

  it("records rejection and blocks the run", async () => {
    const app = createApp({
      now: () => "2026-11-05T16:00:00.000Z",
      createId: (prefix) => `${prefix}_c`,
    });
    const run = await runTask(app, { task: "Change a component", cwd: process.cwd() });
    const decided = decidePlanApproval(app, {
      runId: run.runId,
      decision: "deny",
      decidedBy: "maintainer",
      rationale: "Out of scope for now",
    });
    expect(decided.status).toBe("blocked");
    expect(decided.approval.decision).toBe("deny");
  });
});
