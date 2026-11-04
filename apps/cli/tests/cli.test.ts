import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "@aep/application";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProgram } from "../src/program.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
  vi.restoreAllMocks();
});

async function runCli(
  args: string[],
  app = createApp(),
): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  const program = buildProgram({ app, exitOverride: true });
  let stdout = "";
  let stderr = "";
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  const previousCode = process.exitCode;
  process.exitCode = undefined;
  try {
    await program.parseAsync(["node", "aep", ...args]);
  } catch {
    // exitOverride throws on --help/--version; command failures set exitCode only.
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }
  const code = process.exitCode ?? 0;
  process.exitCode = previousCode;
  return { code, stdout, stderr };
}

describe("@aep/cli", () => {
  it("prints help", async () => {
    const result = await runCli(["--help"]);
    expect(result.stdout).toContain("Agent Engineering Platform CLI");
    expect(result.stdout).toContain("doctor");
    expect(result.stdout).toContain("init");
    expect(result.stdout).toContain("run");
    expect(result.stdout).toContain("status");
    expect(result.stdout).toContain("resume");
    expect(result.stdout).toContain("recoveries");
  });

  it("prints version", async () => {
    const result = await runCli(["--version"]);
    expect(result.stdout.trim()).toBe("0.0.0");
  });

  it("emits doctor JSON", async () => {
    const result = await runCli(["--json", "doctor"]);
    expect(result.code).toBe(0);
    const parsed: unknown = JSON.parse(result.stdout);
    expect(typeof parsed).toBe("object");
    expect(parsed).not.toBeNull();
    if (typeof parsed === "object" && parsed !== null && "ok" in parsed) {
      expect(parsed.ok).toBe(true);
    }
  });

  it("inits a project and runs a fake task with status", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aep-cli-"));
    tempDirs.push(dir);
    const app = createApp({
      now: () => "2026-11-05T00:00:00.000Z",
      createId: (prefix) => `${prefix}_cli`,
    });

    const init = await runCli(["--json", "init", dir], app);
    expect(init.code).toBe(0);

    const run = await runCli(["--json", "run", "Draft a plan"], app);
    expect(run.code).toBe(0);
    const runPayload: unknown = JSON.parse(run.stdout);
    expect(
      typeof runPayload === "object" &&
        runPayload !== null &&
        "runId" in runPayload &&
        typeof runPayload.runId === "string",
    ).toBe(true);

    const runId =
      typeof runPayload === "object" &&
      runPayload !== null &&
      "runId" in runPayload &&
      typeof runPayload.runId === "string"
        ? runPayload.runId
        : "";

    const status = await runCli(["--json", "status", runId], app);
    expect(status.code).toBe(0);
    expect(status.stdout).toContain("awaiting_plan_approval");
  });
});
