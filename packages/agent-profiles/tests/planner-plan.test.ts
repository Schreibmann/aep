import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeAgentRuntime } from "@aep/runtime-contracts";
import { assertPlannerReadOnly, PLANNER_TOOLS, SecurityError } from "@aep/security";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildPlannerUserPrompt,
  buildPlanRepairPrompt,
  createPlannerProfile,
  gatherPlannerProjectContext,
  parsePlannerPlan,
  parsePlannerPlanWithBoundedRetry,
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

const validPlan = {
  objective: "Fix the race",
  summary: "Investigate and patch the race in src/app.ts",
  assumptions: ["tests exist"],
  touchedPaths: ["src/app.ts", "src/app.test.ts"],
  steps: [
    { id: "s1", description: "Reproduce", paths: ["src/app.ts"] },
    { id: "s2", description: "Patch and test", paths: ["src/app.ts", "src/app.test.ts"] },
  ],
  risks: ["timing flake"],
  gates: [{ id: "lint", commandHint: "pnpm lint", required: true }],
  validationCommands: ["pnpm test", "pnpm lint"],
  estimate: { complexity: "medium" as const, notes: "small change" },
  approvalFlags: {
    requiresHumanApprovalBeforeWrite: true,
    mayTouchSecretsOrAuth: false,
    mayNeedNetwork: false,
  },
};

describe("AEP-050 planner plan schema", () => {
  it("accepts a valid plan and rejects missing paths/commands", () => {
    const ok = parsePlannerPlan(JSON.stringify(validPlan));
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.plan.touchedPaths).toContain("src/app.ts");
      expect(ok.plan.validationCommands.length).toBeGreaterThan(0);
    }

    const bad = parsePlannerPlan(
      JSON.stringify({
        ...validPlan,
        touchedPaths: [],
        validationCommands: [],
      }),
    );
    expect(bad.ok).toBe(false);
  });

  it("parses fenced JSON and builds a versioned planner profile", () => {
    const profile = createPlannerProfile();
    expect(profile.id).toBe("planner");
    expect(profile.tools).toEqual(PLANNER_TOOLS);
    expect(profile.profileVersionHash.length).toBe(16);
    expect(profile.systemPrompt).toContain("MUST NOT edit");

    const fenced = parsePlannerPlan(
      `Here you go:\n\`\`\`json\n${JSON.stringify(validPlan)}\n\`\`\``,
    );
    expect(fenced.ok).toBe(true);

    assertPlannerReadOnly(profile.tools);
    expect(() =>
      assertPlannerReadOnly({
        tools: ["read", "shell"],
        disallowedTools: ["edit"],
      }),
    ).toThrow(SecurityError);
  });

  it("gathers truncated project context without requiring full tree", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aep-planner-ctx-"));
    tempDirs.push(dir);
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "demo", scripts: { test: "vitest", lint: "biome" } }),
      "utf8",
    );
    await writeFile(join(dir, "AGENTS.md"), "Follow AEP rules.\n", "utf8");
    const context = gatherPlannerProjectContext(dir);
    expect(context).toContain("demo");
    expect(context).toContain("test");
    expect(context).toContain("AGENTS.md");
  });

  it("retries invalid planner output then accepts a valid plan", async () => {
    const runtime = new FakeAgentRuntime({
      scripts: {
        exec_bad: {
          events: [
            {
              type: "started",
              executionId: "exec_bad",
              agentId: "agent_bad",
              runId: "run_bad",
            },
            { type: "completed", executionId: "exec_bad", resultText: "not-json" },
          ],
          result: {
            executionId: "exec_bad",
            status: "completed",
            resultText: "not-json",
          },
          usage: { status: "unknown", costStatus: "unknown", tokens: {} },
        },
        exec_good: {
          events: [
            {
              type: "started",
              executionId: "exec_good",
              agentId: "agent_good",
              runId: "run_good",
            },
            {
              type: "completed",
              executionId: "exec_good",
              resultText: JSON.stringify(validPlan),
            },
          ],
          result: {
            executionId: "exec_good",
            status: "completed",
            resultText: JSON.stringify(validPlan),
          },
          usage: { status: "unknown", costStatus: "unknown", tokens: {} },
        },
      },
    });

    const parsed = await parsePlannerPlanWithBoundedRetry({
      runtime,
      maxAttempts: 2,
      start: () =>
        runtime.startExecution({
          executionId: "exec_bad",
          roleId: "planner",
          prompt: "plan it",
          modelId: "fake-model",
          cwd: "/tmp",
          tools: PLANNER_TOOLS,
          sandbox: { enabled: true },
        }),
      retry: async (issues) => {
        expect(issues.length).toBeGreaterThan(0);
        expect(buildPlanRepairPrompt("plan it", issues)).toContain("Validation issues");
        return runtime.startExecution({
          executionId: "exec_good",
          roleId: "planner",
          prompt: buildPlannerUserPrompt({
            task: "plan it",
            projectContext: "",
          }),
          modelId: "fake-model",
          cwd: "/tmp",
          tools: PLANNER_TOOLS,
          sandbox: { enabled: true },
        });
      },
    });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.attempts).toBe(2);
      expect(parsed.plan.objective).toBe("Fix the race");
    }
  });
});
