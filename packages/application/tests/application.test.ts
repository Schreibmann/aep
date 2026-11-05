import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ApplicationError,
  createApp,
  getRunStatus,
  initProject,
  runDoctor,
  runTask,
} from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("@aep/application", () => {
  it("runs doctor against the fake runtime", async () => {
    const app = createApp({
      now: () => "2026-11-05T00:00:00.000Z",
      createId: (prefix) => `${prefix}_fixed`,
    });
    const report = await runDoctor(app);
    expect(report.ok).toBe(true);
    expect(report.checks.some((check) => check.name === "agent_runtime" && check.ok)).toBe(true);
  });

  it("initializes .aep/config.yaml once without overwrite", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aep-init-"));
    tempDirs.push(dir);
    const first = await initProject(dir);
    expect(first.created).toBe(true);
    const body = await readFile(first.configPath, "utf8");
    expect(body).toContain("sandbox:");
    await expect(initProject(dir)).rejects.toBeInstanceOf(ApplicationError);
  });

  it("runs a fake planner execution and reports status", async () => {
    const app = createApp({
      now: () => "2026-11-05T00:00:00.000Z",
      createId: (prefix) => `${prefix}_1`,
    });
    const result = await runTask(app, {
      task: "Inspect registration race",
      cwd: process.cwd(),
    });
    expect(result.runId).toBe("run_1");
    expect(result.status).toBe("awaiting_plan_approval");
    expect(result.plan?.touchedPaths.length).toBeGreaterThan(0);
    expect(result.plan?.validationCommands.length).toBeGreaterThan(0);
    expect(result.plannerProfileVersionHash?.length).toBe(16);
    expect(result.policy?.verdict.decision).toBe("require_approval");
    expect(result.policy?.classification.risk).not.toBe("low");

    const status = getRunStatus(app, result.runId);
    expect(status.taskDescription).toContain("registration");
    expect(status.status).toBe("awaiting_plan_approval");

    const stored = app.runs.get(result.runId);
    expect(stored?.plan?.objective.length).toBeGreaterThan(0);
    expect(stored?.planSchemaVersion).toBe(result.planSchemaVersion);
    expect(stored?.policy?.requirements.requireHumanApproval).toBe(true);
  });
});
