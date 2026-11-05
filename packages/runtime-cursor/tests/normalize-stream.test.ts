import { MemoryCredentialSource } from "@aep/security";
import { describe, expect, it } from "vitest";
import { CursorAgentRuntime } from "../src/cursor-agent-runtime.js";
import {
  BoundedEventBuffer,
  normalizeSdkStreamEvent,
  parseUnknownSdkMessage,
} from "../src/normalize.js";
import { StubCursorSdkBridge } from "../src/stub-sdk-bridge.js";

describe("AEP-041 stream normalization", () => {
  it("drops thinking and never throws on unknown envelopes", () => {
    const ctx = { executionId: "e1", agentId: "a1", runId: "r1" };
    expect(normalizeSdkStreamEvent(ctx, { type: "thinking", text: "secret" })).toBeUndefined();
    expect(parseUnknownSdkMessage(null).type).toBe("unknown");
    expect(parseUnknownSdkMessage({ type: "tool_call", name: "read", args: { x: 1 } })).toEqual({
      type: "tool_call",
      name: "read",
      status: "unknown",
    });
    const unknown = normalizeSdkStreamEvent(ctx, { type: "unknown", rawType: "weird" });
    expect(unknown?.type).toBe("status");
  });

  it("keeps event order in a bounded buffer and drops oldest", () => {
    const buffer = new BoundedEventBuffer(2);
    buffer.push({ type: "started", executionId: "e", agentId: "a", runId: "r" });
    buffer.push({ type: "assistant_text", executionId: "e", text: "one" });
    buffer.push({ type: "assistant_text", executionId: "e", text: "two" });
    expect(buffer.droppedCount).toBe(1);
    expect(buffer.snapshot().map((event) => event.type)).toEqual([
      "assistant_text",
      "assistant_text",
    ]);
  });

  it("propagates cancellation and closes resources", async () => {
    const bridge = new StubCursorSdkBridge({
      streamEvents: [
        { type: "assistant", text: "partial" },
        { type: "thinking", text: "hidden" },
        { type: "status", status: "running" },
      ],
      runResult: {
        id: "run_slow",
        status: "finished",
        resultText: "should-not-matter-if-cancelled",
      },
    });
    const runtime = new CursorAgentRuntime({
      credentials: new MemoryCredentialSource("k"),
      sdk: bridge,
      maxBufferedEvents: 50,
    });
    const handle = await runtime.startExecution({
      executionId: "exec-cancel",
      roleId: "planner",
      prompt: "go",
      modelId: "stub-model",
      cwd: "/tmp",
      tools: { tools: ["read"], disallowedTools: ["shell"] },
      sandbox: { enabled: true },
    });

    await runtime.cancelExecution("exec-cancel");
    const result = await handle.wait();
    expect(result.status).toBe("cancelled");
  });

  it("records terminal status without private thinking text", async () => {
    const bridge = new StubCursorSdkBridge({
      streamEvents: [
        { type: "thinking", text: "private-chain" },
        { type: "assistant", text: "visible" },
        { type: "unknown", rawType: "future_event" },
      ],
    });
    const runtime = new CursorAgentRuntime({
      credentials: new MemoryCredentialSource("k"),
      sdk: bridge,
    });
    const handle = await runtime.startExecution({
      executionId: "exec-norm",
      roleId: "planner",
      prompt: "go",
      modelId: "stub-model",
      cwd: "/tmp",
      tools: { tools: ["read"], disallowedTools: ["shell"] },
      sandbox: { enabled: true },
    });
    const types: string[] = [];
    for await (const event of handle.stream()) {
      types.push(event.type);
      if (event.type === "assistant_text") {
        expect(event.text).toBe("visible");
      }
    }
    expect(types).not.toContain("thinking");
    expect(types.join(",")).not.toContain("private-chain");
    const recorded = runtime.getRecordedEvents("exec-norm");
    expect(recorded.some((event) => event.type === "assistant_text")).toBe(true);
    const result = await handle.wait();
    expect(result.status).toBe("completed");
    expect(runtime.getRecordedEvents("exec-norm")).toEqual([]);
  });

  it("times out, cancels the SDK run, and returns execution_timeout", async () => {
    const bridge = new StubCursorSdkBridge({
      waitDelayMs: 200,
      runResult: { id: "run_slow", status: "finished", resultText: "late" },
    });
    const runtime = new CursorAgentRuntime({
      credentials: new MemoryCredentialSource("k"),
      sdk: bridge,
      defaultTimeoutMs: 20,
    });
    const handle = await runtime.startExecution({
      executionId: "exec-timeout",
      roleId: "planner",
      prompt: "go",
      modelId: "stub-model",
      cwd: "/tmp",
      tools: { tools: ["read"], disallowedTools: ["shell"] },
      sandbox: { enabled: true },
    });
    const result = await handle.wait();
    expect(result.status).toBe("failed");
    expect(result.code).toBe("execution_timeout");
  });
});
