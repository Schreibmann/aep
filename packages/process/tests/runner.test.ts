import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type ProcessError, SafeCommandRunner, TrustedCommandRegistry } from "../src/index.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

function nodeRunner(): SafeCommandRunner {
  return new SafeCommandRunner(
    new TrustedCommandRegistry([{ id: "node", executable: process.execPath }]),
  );
}

describe("@aep/process SafeCommandRunner", () => {
  it("rejects untrusted command ids", async () => {
    const runner = nodeRunner();
    await expect(
      runner.run({
        commandId: "curl",
        argv: ["https://example.com"],
        cwd: process.cwd(),
        timeoutMs: 1000,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: "untrusted_command" } satisfies Partial<ProcessError>);
  });

  it("does not interpret shell metacharacters in argv", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aep-proc-meta-"));
    tempDirs.push(dir);
    const marker = join(dir, "should-not-exist.txt");
    const runner = nodeRunner();

    // If shell interpolation happened, `&&` would create the marker file.
    const result = await runner.run({
      commandId: "node",
      argv: ["-e", "process.stdout.write('safe')", "&&", `echo pwned > "${marker}"`],
      cwd: dir,
      timeoutMs: 5000,
      maxStdoutBytes: 1024,
      maxStderrBytes: 1024,
    });

    expect(result.stdout).toBe("safe");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    await expect(access(marker)).rejects.toBeTruthy();
  });

  it("times out and kills a hung process", async () => {
    const runner = nodeRunner();
    const result = await runner.run({
      commandId: "node",
      argv: ["-e", "setInterval(() => {}, 1000)"],
      cwd: process.cwd(),
      timeoutMs: 300,
      maxStdoutBytes: 1024,
      maxStderrBytes: 1024,
    });
    expect(result.timedOut).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(250);
  });

  it("truncates stdout deterministically and redacts secrets", async () => {
    const runner = nodeRunner();
    const secret = "super-secret-token";
    const result = await runner.run({
      commandId: "node",
      argv: [
        "-e",
        `process.stdout.write(${JSON.stringify(`prefix-${secret}-suffix-${"x".repeat(200)}`)})`,
      ],
      cwd: process.cwd(),
      timeoutMs: 5000,
      maxStdoutBytes: 40,
      maxStderrBytes: 1024,
      redactSecrets: [secret],
    });
    expect(result.stdoutTruncated).toBe(true);
    expect(Buffer.byteLength(result.stdout, "utf8")).toBeLessThanOrEqual(40);
    expect(result.stdout.includes(secret)).toBe(false);
    expect(result.stdout.includes("[REDACTED]") || result.stdout.startsWith("prefix-")).toBe(true);
  });
});
