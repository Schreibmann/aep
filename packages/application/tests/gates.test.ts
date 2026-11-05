import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunCommandInput, RunCommandResult } from "@aep/process";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, runGatesForRun, runTask } from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("AEP-053 application gate runner", () => {
  it("stores gate evidence on the run for the reviewer", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aep-app-gates-"));
    tempDirs.push(dir);
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "demo", scripts: { lint: "echo lint", test: "echo test" } }),
      "utf8",
    );
    await writeFile(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");

    const app = createApp({
      now: () => "2026-11-05T17:00:00.000Z",
      createId: (prefix) => `${prefix}_g`,
    });
    const run = await runTask(app, { task: "Ship a fix", cwd: dir });

    const runner = {
      async run(input: RunCommandInput): Promise<RunCommandResult> {
        return {
          commandId: input.commandId,
          executable: input.commandId,
          argv: input.argv,
          cwd: input.cwd,
          exitCode: 0,
          signal: null,
          timedOut: false,
          durationMs: 5,
          stdout: "pass",
          stderr: "",
          stdoutTruncated: false,
          stderrTruncated: false,
        };
      },
    };

    const result = await runGatesForRun(app, {
      runId: run.runId,
      cwd: dir,
      phase: "fast",
      runner,
    });
    expect(result.gates.ok).toBe(true);
    expect(result.gates.evidence.length).toBeGreaterThan(0);
    expect(app.runs.get(run.runId)?.gateResults?.evidence[0]?.stdoutTail).toBe("pass");
  });
});
