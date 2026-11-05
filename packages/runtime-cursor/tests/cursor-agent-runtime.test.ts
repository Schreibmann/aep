import { MemoryCredentialSource } from "@aep/security";
import { describe, expect, it } from "vitest";
import { CursorAgentRuntime } from "../src/cursor-agent-runtime.js";
import { StubCursorSdkBridge } from "../src/stub-sdk-bridge.js";

const SANDBOX = { enabled: true } as const;
const TOOLS = {
  tools: ["read", "grep", "glob", "ls"],
  disallowedTools: ["shell", "edit", "mcp", "task"],
};

describe("CursorAgentRuntime (AEP-040)", () => {
  it("starts a sandboxed local session via the SDK bridge and disposes the agent", async () => {
    const bridge = new StubCursorSdkBridge();
    const runtime = new CursorAgentRuntime({
      credentials: new MemoryCredentialSource("test-key"),
      sdk: bridge,
      now: () => "2026-11-05T12:00:00.000Z",
    });

    const health = await runtime.checkAvailability();
    expect(health.ok).toBe(true);
    expect(health.sandboxReady).toBe(true);

    const catalog = await runtime.discoverModels();
    expect(catalog.models[0]?.id).toBe("stub-model");

    const handle = await runtime.startExecution({
      executionId: "exec-1",
      roleId: "planner",
      prompt: "Inspect the race",
      modelId: "stub-model",
      cwd: "/tmp/work",
      tools: TOOLS,
      sandbox: SANDBOX,
      systemPrompt: "planner prompt",
    });

    expect(handle.agentId.startsWith("stub-agent-")).toBe(true);
    expect(bridge.created).toHaveLength(1);
    expect(bridge.created[0]?.sandbox.enabled).toBe(true);
    expect(bridge.created[0]?.tools).toEqual(TOOLS.tools);
    expect(bridge.created[0]?.disallowedTools).toEqual(TOOLS.disallowedTools);
    expect(bridge.created[0]?.systemPrompt).toBe("planner prompt");
    expect(bridge.created[0]?.apiKey).toBe("test-key");

    const events: string[] = [];
    for await (const event of handle.stream()) {
      events.push(event.type);
    }
    expect(events[0]).toBe("started");
    expect(events).toContain("assistant_text");

    const result = await handle.wait();
    expect(result.status).toBe("completed");
    expect(result.resultText).toBe("stub-ok");
  });

  it("blocks execution when sandbox is unsupported", async () => {
    const bridge = new StubCursorSdkBridge({
      sandboxSupported: false,
      sandboxDetail: "helper missing",
    });
    const runtime = new CursorAgentRuntime({
      credentials: new MemoryCredentialSource("test-key"),
      sdk: bridge,
    });

    await expect(
      runtime.startExecution({
        executionId: "exec-block",
        roleId: "implementer",
        prompt: "write",
        modelId: "stub-model",
        cwd: "/tmp/work",
        tools: {
          tools: ["read", "edit", "shell"],
          disallowedTools: ["mcp", "task"],
        },
        sandbox: SANDBOX,
      }),
    ).rejects.toThrow(/sandbox/i);
  });

  it("resumes with reapplied tool and sandbox settings", async () => {
    const bridge = new StubCursorSdkBridge();
    const runtime = new CursorAgentRuntime({
      credentials: new MemoryCredentialSource("test-key"),
      sdk: bridge,
    });

    const handle = await runtime.resumeExecution({
      executionId: "exec-resume",
      opaqueAgentId: "agent-opaque",
      roleId: "reviewer",
      modelId: "stub-model",
      cwd: "/tmp/work",
      tools: TOOLS,
      sandbox: SANDBOX,
      systemPrompt: "reviewer prompt",
    });

    expect(bridge.resumed).toHaveLength(1);
    expect(bridge.resumed[0]?.agentId).toBe("agent-opaque");
    expect(bridge.resumed[0]?.sandbox.enabled).toBe(true);
    expect(bridge.resumed[0]?.disallowedTools).toContain("shell");
    const result = await handle.wait();
    expect(result.status).toBe("completed");
  });

  it("does not export SDK types from the public package surface", async () => {
    const exported = await import("../src/index.js");
    expect(exported.CursorAgentRuntime).toBeTypeOf("function");
    expect(exported.StubCursorSdkBridge).toBeTypeOf("function");
    expect(exported.CURSOR_SDK_PINNED_VERSION).toBe("1.3.1");
    // Live bridge stays internal; public API is AEP-facing only.
    expect("LiveCursorSdkBridge" in exported).toBe(false);
    expect("Agent" in exported).toBe(false);
  });
});
