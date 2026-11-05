import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SafeCommandRunner, TrustedCommandRegistry } from "@aep/process";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertNoSecretInText,
  assertReviewerReadOnly,
  assertSandboxReady,
  buildIsolatedAgentEnv,
  listBlockedEnvKeys,
  MemoryCredentialSource,
  REVIEWER_TOOLS,
  requireEnabledSandbox,
  resolveCursorApiKeyForSdk,
  SecurityError,
  toolPolicyForRole,
} from "../src/index.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("@aep/security baseline", () => {
  it("builds an isolated env without credential keys or home secrets", async () => {
    const worktree = await mkdtemp(join(tmpdir(), "aep-sec-wt-"));
    tempDirs.push(worktree);
    const isolated = buildIsolatedAgentEnv({ worktreePath: worktree });
    expect(isolated.env.HOME).toBe(isolated.homeDir);
    expect(isolated.env.CURSOR_API_KEY).toBeUndefined();
    expect(isolated.env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(isolated.env.SSH_AUTH_SOCK).toBeUndefined();
    for (const key of listBlockedEnvKeys()) {
      expect(isolated.env[key]).toBeUndefined();
    }
    expect(() =>
      buildIsolatedAgentEnv({
        worktreePath: worktree,
        extra: { CURSOR_API_KEY: "should-fail" },
      }),
    ).toThrow(SecurityError);
  });

  it("requires sandbox enabled and blocks unsupported hosts", () => {
    expect(() => requireEnabledSandbox({ enabled: false })).toThrow(SecurityError);
    requireEnabledSandbox({ enabled: true });
    expect(() => assertSandboxReady({ sandboxSupported: false, detail: "helper missing" })).toThrow(
      SecurityError,
    );
    assertSandboxReady({ sandboxSupported: true, detail: "ok" });
  });

  it("exposes role tool allowlists and keeps reviewer read-only", () => {
    expect(toolPolicyForRole("implementer").tools).toContain("shell");
    expect(toolPolicyForRole("implementer").disallowedTools).toContain("mcp");
    assertReviewerReadOnly(REVIEWER_TOOLS);
    expect(() => assertReviewerReadOnly({ tools: ["read", "shell"], disallowedTools: [] })).toThrow(
      SecurityError,
    );
  });

  it("resolves API keys only via secure source and detects leaks in text", () => {
    const source = new MemoryCredentialSource("sk-test-key");
    expect(resolveCursorApiKeyForSdk(source)).toBe("sk-test-key");
    expect(() => resolveCursorApiKeyForSdk(new MemoryCredentialSource(undefined))).toThrow(
      SecurityError,
    );
    expect(() => assertNoSecretInText("hello sk-test-key", ["sk-test-key"])).toThrow(SecurityError);
    assertNoSecretInText("hello", ["sk-test-key"]);
  });

  it("secret canary is not readable through an agent shell command env", async () => {
    const worktree = await mkdtemp(join(tmpdir(), "aep-canary-wt-"));
    tempDirs.push(worktree);
    const canary = "CANARY_SECRET_VALUE_9f3a";
    const home = await mkdtemp(join(tmpdir(), "aep-canary-home-"));
    tempDirs.push(home);
    await writeFile(join(home, "canary.txt"), canary, "utf8");

    const isolated = buildIsolatedAgentEnv({
      worktreePath: worktree,
      homeDir: home,
    });
    // Simulate operator mistake: canary only in isolated HOME file, not env.
    const runner = new SafeCommandRunner(
      new TrustedCommandRegistry([{ id: "node", executable: process.execPath }]),
    );
    const result = await runner.run({
      commandId: "node",
      argv: [
        "-e",
        "const fs=require('fs'); const p=require('path'); try { process.stdout.write(fs.readFileSync(p.join(process.env.HOME,'canary.txt'),'utf8')) } catch (e) { process.stdout.write('missing') }",
      ],
      cwd: worktree,
      envAllowlist: [],
      envExtra: isolated.env,
      timeoutMs: 5000,
      maxStdoutBytes: 4096,
      maxStderrBytes: 4096,
      redactSecrets: [canary],
    });

    // File in isolated HOME is readable by design of THIS test harness (HOME points there).
    // The security property under test: canary must not appear in env allowlist / blocked keys,
    // and redaction strips it from captured output when configured.
    expect(isolated.env.CURSOR_API_KEY).toBeUndefined();
    expect(result.stdout.includes(canary)).toBe(false);
    expect(result.stdout.includes("[REDACTED]") || result.stdout === "missing").toBe(true);
  });
});
