import { MemoryCredentialSource } from "@aep/security";
import { describe, expect, it } from "vitest";
import { CursorAgentRuntime } from "../src/cursor-agent-runtime.js";
import { AgentSessionRegistry, evaluateResumeSafety } from "../src/session-registry.js";
import { StubCursorSdkBridge } from "../src/stub-sdk-bridge.js";

const REVIEWER_TOOLS = {
  tools: ["read", "grep", "glob", "ls"],
  disallowedTools: ["shell", "edit", "mcp", "task"],
} as const;

const IMPLEMENTER_TOOLS = {
  tools: ["read", "edit", "shell"],
  disallowedTools: ["mcp", "task"],
} as const;

describe("AEP-043 session resume", () => {
  it("evaluates reviewer isolation against implementer sessions", () => {
    const ok = evaluateResumeSafety({
      requestedRoleId: "reviewer",
      recorded: {
        agentId: "a1",
        roleId: "implementer",
        tools: IMPLEMENTER_TOOLS,
        modelId: "m",
        cwd: "/tmp",
      },
    });
    expect(ok.ok).toBe(false);
    if (!ok.ok) {
      expect(ok.reason).toContain("reviewer_must_not_inherit");
    }
  });

  it("reapplies tools, systemPrompt, sandbox, params, and settingSources on resume", async () => {
    const bridge = new StubCursorSdkBridge();
    const runtime = new CursorAgentRuntime({
      credentials: new MemoryCredentialSource("k"),
      sdk: bridge,
    });

    const handle = await runtime.resumeExecution({
      executionId: "exec-r1",
      opaqueAgentId: "agent-opaque",
      roleId: "reviewer",
      modelId: "stub-model",
      modelParams: [{ id: "optimize_for", value: "quality" }],
      cwd: "/tmp/work",
      tools: REVIEWER_TOOLS,
      sandbox: { enabled: true },
      systemPrompt: "reviewer-only",
      settingSources: ["project"],
    });

    expect(bridge.resumed).toHaveLength(1);
    const resumed = bridge.resumed[0];
    expect(resumed?.tools).toEqual(REVIEWER_TOOLS.tools);
    expect(resumed?.disallowedTools).toEqual(REVIEWER_TOOLS.disallowedTools);
    expect(resumed?.systemPrompt).toBe("reviewer-only");
    expect(resumed?.sandbox.enabled).toBe(true);
    expect(resumed?.modelParams).toEqual([{ id: "optimize_for", value: "quality" }]);
    expect(resumed?.settingSources).toEqual(["project"]);
    expect(handle.contextReset).toBeUndefined();
    await handle.wait();
  });

  it("never lets reviewer inherit an implementer agentId", async () => {
    const bridge = new StubCursorSdkBridge();
    const sessions = new AgentSessionRegistry();
    sessions.remember({
      agentId: "impl-agent",
      roleId: "implementer",
      tools: IMPLEMENTER_TOOLS,
      modelId: "stub-model",
      cwd: "/tmp/work",
    });
    const runtime = new CursorAgentRuntime({
      credentials: new MemoryCredentialSource("k"),
      sdk: bridge,
      sessions,
    });

    const handle = await runtime.resumeExecution({
      executionId: "exec-review",
      opaqueAgentId: "impl-agent",
      roleId: "reviewer",
      modelId: "stub-model",
      cwd: "/tmp/work",
      tools: REVIEWER_TOOLS,
      sandbox: { enabled: true },
      systemPrompt: "reviewer-only",
    });

    expect(bridge.resumed).toHaveLength(0);
    expect(bridge.created).toHaveLength(1);
    expect(bridge.created[0]?.tools).toEqual(REVIEWER_TOOLS.tools);
    expect(bridge.created[0]?.disallowedTools).toContain("shell");
    expect(handle.contextReset).toBe(true);
    expect(handle.contextResetReason).toContain("reviewer_must_not_inherit");
    expect(handle.agentId).not.toBe("impl-agent");
    await handle.wait();
  });

  it("falls back to a fresh session with contextReset when Agent.resume fails", async () => {
    const bridge = new StubCursorSdkBridge({
      resumeError: { code: "session_gone", message: "not found" },
    });
    const runtime = new CursorAgentRuntime({
      credentials: new MemoryCredentialSource("k"),
      sdk: bridge,
    });

    const handle = await runtime.resumeExecution({
      executionId: "exec-fallback",
      opaqueAgentId: "missing-agent",
      roleId: "planner",
      modelId: "stub-model",
      cwd: "/tmp/work",
      tools: REVIEWER_TOOLS,
      sandbox: { enabled: true },
    });

    expect(bridge.resumed).toHaveLength(0);
    expect(bridge.created).toHaveLength(1);
    expect(handle.contextReset).toBe(true);
    expect(handle.contextResetReason).toContain("resume_failed");
    await handle.wait();
  });
});
