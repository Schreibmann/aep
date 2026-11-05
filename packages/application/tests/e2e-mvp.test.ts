import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isWorkingTreeDirty, runGit } from "@aep/git-workspaces";
import type { RunCommandInput, RunCommandResult } from "@aep/process";
import { FakeAgentRuntime } from "@aep/runtime-contracts";
import { afterEach, describe, expect, it } from "vitest";
import {
  createApp,
  decidePlanApproval,
  prepareWorkspace,
  resumeRun,
  runBoundedFixCycle,
  runGatesForRun,
  runImplementer,
  runReview,
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

const planJson = JSON.stringify({
  objective: "Fix off-by-one in helper",
  summary: "Correct the loop bound in src/helper.ts",
  assumptions: ["tests cover the helper"],
  touchedPaths: ["src/helper.ts"],
  steps: [{ id: "s1", description: "Patch helper", paths: ["src/helper.ts"] }],
  risks: ["none"],
  gates: [{ id: "lint", commandHint: "pnpm lint", required: true }],
  validationCommands: ["pnpm lint", "pnpm test"],
  estimate: { complexity: "low" },
  approvalFlags: {
    requiresHumanApprovalBeforeWrite: true,
    mayTouchSecretsOrAuth: false,
    mayNeedNetwork: false,
  },
});

const reviewFindingJson = JSON.stringify({
  verdict: "request_changes",
  assurance: "same_model_fresh_session",
  summary: "One blocking bug remains",
  findings: [
    {
      id: "f1",
      severity: "high",
      category: "bug",
      file: "src/helper.ts",
      line: 2,
      title: "Off-by-one",
      evidence: "loop uses <= length",
      confidence: "high",
    },
  ],
});

const reviewApproveJson = JSON.stringify({
  verdict: "approve",
  assurance: "same_model_fresh_session",
  summary: "Finding fixed",
  findings: [],
});

async function initDisposableRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "aep-e2e-"));
  tempDirs.push(dir);
  runGit(dir, ["init"]);
  runGit(dir, ["config", "core.autocrlf", "false"]);
  runGit(dir, ["config", "user.email", "aep@example.com"]);
  runGit(dir, ["config", "user.name", "AEP Test"]);
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "aep-e2e-demo",
      private: true,
      scripts: {
        lint: "echo lint",
        test: "echo test",
        build: "echo build",
        typecheck: "echo types",
      },
      dependencies: { react: "19.0.0" },
    }),
    "utf8",
  );
  await writeFile(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  await writeFile(join(dir, ".gitignore"), ".worktrees/\n", "utf8");
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(
    join(dir, "src", "helper.ts"),
    "export const n = (xs: number[]) => xs.length;\n",
    "utf8",
  );
  runGit(dir, ["add", "."]);
  runGit(dir, ["commit", "-m", "init"]);
  return dir;
}

describe("AEP-057 end-to-end MVP (fake runtime)", () => {
  it("runs plan → approve → worktree → implement → gates → review → fix → report", async () => {
    const repo = await initDisposableRepo();
    const mainHelperBefore = await readFile(join(repo, "src", "helper.ts"), "utf8");
    const worktreesRoot = join(repo, ".worktrees");

    let execN = 0;
    const runtime = new FakeAgentRuntime({
      scripts: {
        exec_plan: {
          events: [
            {
              type: "started",
              executionId: "exec_plan",
              agentId: "agent_plan",
              runId: "sdk_plan",
            },
            { type: "completed", executionId: "exec_plan", resultText: planJson },
          ],
          result: { executionId: "exec_plan", status: "completed", resultText: planJson },
          usage: { status: "unknown", costStatus: "unknown", tokens: { inputTokens: 2 } },
        },
        exec_impl1: {
          events: [
            {
              type: "started",
              executionId: "exec_impl1",
              agentId: "agent_impl1",
              runId: "sdk_impl1",
            },
            { type: "completed", executionId: "exec_impl1", resultText: "implemented" },
          ],
          result: { executionId: "exec_impl1", status: "completed", resultText: "implemented" },
          usage: { status: "unknown", costStatus: "unknown", tokens: { inputTokens: 3 } },
        },
        exec_rev1: {
          events: [
            {
              type: "started",
              executionId: "exec_rev1",
              agentId: "agent_rev1",
              runId: "sdk_rev1",
            },
            { type: "completed", executionId: "exec_rev1", resultText: reviewFindingJson },
          ],
          result: {
            executionId: "exec_rev1",
            status: "completed",
            resultText: reviewFindingJson,
          },
          usage: { status: "unknown", costStatus: "unknown", tokens: { inputTokens: 4 } },
        },
        exec_impl2: {
          events: [
            {
              type: "started",
              executionId: "exec_impl2",
              agentId: "agent_impl2",
              runId: "sdk_impl2",
            },
            { type: "completed", executionId: "exec_impl2", resultText: "fixed" },
          ],
          result: { executionId: "exec_impl2", status: "completed", resultText: "fixed" },
          usage: { status: "unknown", costStatus: "unknown", tokens: { inputTokens: 5 } },
        },
        exec_rev2: {
          events: [
            {
              type: "started",
              executionId: "exec_rev2",
              agentId: "agent_rev2",
              runId: "sdk_rev2",
            },
            { type: "completed", executionId: "exec_rev2", resultText: reviewApproveJson },
          ],
          result: {
            executionId: "exec_rev2",
            status: "completed",
            resultText: reviewApproveJson,
          },
          usage: { status: "unknown", costStatus: "unknown", tokens: { inputTokens: 6 } },
        },
      },
    });

    const execIds = ["exec_plan", "exec_impl1", "exec_rev1", "exec_impl2", "exec_rev2"];
    const app = createApp({
      runtime,
      now: () => "2026-11-05T20:00:00.000Z",
      createId: (prefix) => {
        if (prefix === "exec") {
          const id = execIds[execN] ?? `exec_extra_${execN}`;
          execN += 1;
          return id;
        }
        return `${prefix}_${execN}`;
      },
    });

    const planned = await runTask(app, {
      task: "Fix off-by-one bug in helper",
      cwd: repo,
    });
    expect(planned.status).toBe("awaiting_plan_approval");
    expect(planned.plan?.touchedPaths).toContain("src/helper.ts");

    const approved = decidePlanApproval(app, {
      runId: planned.runId,
      decision: "allow",
      decidedBy: "maintainer",
      rationale: "E2E approve plan",
    });
    expect(approved.status).toBe("preparing_workspace");

    const workspace = prepareWorkspace(app, {
      runId: planned.runId,
      repoPath: repo,
      worktreesRoot,
      taskId: "task_e2e",
    });
    expect(workspace.status).toBe("implementing");
    expect(workspace.worktree.worktreePath.includes(".worktrees")).toBe(true);

    // Main tree remains clean / unchanged content.
    expect(isWorkingTreeDirty(repo)).toBe(false);
    expect(await readFile(join(repo, "src", "helper.ts"), "utf8")).toBe(mainHelperBefore);

    const implemented = await runImplementer(app, {
      runId: planned.runId,
      cwd: workspace.worktree.worktreePath,
    });
    expect(implemented.status).toBe("validating");
    expect(implemented.agentId).toBe("agent_impl1");

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

    const gates = await runGatesForRun(app, {
      runId: planned.runId,
      cwd: workspace.worktree.worktreePath,
      phase: "fast",
      runner: gateRunner,
    });
    expect(gates.gates.ok).toBe(true);
    expect(gates.status).toBe("reviewing");

    const reviewed = await runReview(app, {
      runId: planned.runId,
      cwd: workspace.worktree.worktreePath,
      implementerModelId: "fake-model",
      changedFiles: ["src/helper.ts"],
    });
    expect(reviewed.agentId).toBe("agent_rev1");
    expect(reviewed.agentId).not.toBe(implemented.agentId);
    expect(reviewed.openBlockingFindings).toBe(1);
    expect(reviewed.reviewAssurance).toBe("same_model_fresh_session");

    const fix = await runBoundedFixCycle(app, {
      runId: planned.runId,
      cwd: workspace.worktree.worktreePath,
      changedPathsThisCycle: ["src/helper.ts"],
      gateRunner,
    });
    expect(fix.stopReason).toBe("approved");
    expect(fix.fixedFindingIds).toContain("f1");
    expect(fix.unfixedFindings).toEqual([]);

    const stored = app.runs.get(planned.runId);
    expect(stored?.gateResults?.evidence.length).toBeGreaterThan(0);
    expect(stored?.reviewReport?.verdict).toBe("approve");
    expect(app.usage.listByExecution(planned.executionId).length).toBeGreaterThan(0);
    expect(stored?.budget?.totalRoleExecutions).toBeGreaterThan(0);

    // Restart/resume: settled non-terminal may still list; no crash.
    const resumed = await resumeRun(app, { runId: planned.runId });
    expect(["no_action", "already_terminal", "resumed"]).toContain(resumed.disposition);

    // Still no mutation of main worktree content.
    expect(await readFile(join(repo, "src", "helper.ts"), "utf8")).toBe(mainHelperBefore);
    expect(isWorkingTreeDirty(repo)).toBe(false);
  });
});
