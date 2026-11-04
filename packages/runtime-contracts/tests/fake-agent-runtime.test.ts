import { describe, expect, it } from "vitest";
import {
  type AgentEvent,
  type AgentExecutionInput,
  createFeatureUnavailableUsage,
  FakeAgentRuntime,
  type FakeExecutionScript,
} from "../src/index.js";

const SANDBOX = { enabled: true } as const;

function baseInput(executionId: string): AgentExecutionInput {
  return {
    executionId,
    roleId: "planner",
    prompt: "Summarize",
    modelId: "fake-model",
    cwd: "/tmp/aep-work",
    tools: {
      tools: ["read", "ls"],
      disallowedTools: ["shell", "edit", "mcp", "task"],
    },
    sandbox: SANDBOX,
  };
}

async function collect(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe("FakeAgentRuntime", () => {
  it("streams a scripted happy path and reports unknown usage by default", async () => {
    const runtime = new FakeAgentRuntime();
    const health = await runtime.checkAvailability();
    expect(health.ok).toBe(true);
    expect(health.sandboxReady).toBe(true);

    const catalog = await runtime.discoverModels();
    expect(catalog.models[0]?.id).toBe("fake-model");

    const handle = await runtime.startExecution(baseInput("exec-1"));
    const events = await collect(handle.stream());
    expect(events.map((event) => event.type)).toEqual([
      "started",
      "assistant_text",
      "usage",
      "completed",
    ]);

    const result = await handle.wait();
    expect(result.status).toBe("completed");

    const usage = await runtime.getUsage("exec-1");
    expect(usage.status).toBe("unknown");
    expect(usage.costStatus).toBe("unknown");
  });

  it("can simulate feature_unavailable cost responses", async () => {
    const script: FakeExecutionScript = {
      events: [
        {
          type: "started",
          executionId: "exec-fu",
          agentId: "a1",
          runId: "r1",
        },
        { type: "completed", executionId: "exec-fu", resultText: "done" },
      ],
      result: { executionId: "exec-fu", status: "completed", resultText: "done" },
      usage: createFeatureUnavailableUsage({ inputTokens: 10, outputTokens: 2 }),
    };
    const runtime = new FakeAgentRuntime({ scripts: { "exec-fu": script } });
    await runtime.startExecution(baseInput("exec-fu"));
    const usage = await runtime.getUsage("exec-fu");
    expect(usage.status).toBe("feature_unavailable");
    expect(usage.costStatus).toBe("unknown");
    if (usage.status === "feature_unavailable") {
      expect(usage.tokens.inputTokens).toBe(10);
    }
  });

  it("supports failure scripts", async () => {
    const script: FakeExecutionScript = {
      events: [
        {
          type: "started",
          executionId: "exec-fail",
          agentId: "a1",
          runId: "r1",
        },
        {
          type: "failed",
          executionId: "exec-fail",
          code: "sandbox_unsupported_on_host",
          safeMessage: "sandbox unavailable",
        },
      ],
      result: {
        executionId: "exec-fail",
        status: "failed",
        code: "sandbox_unsupported_on_host",
        safeMessage: "sandbox unavailable",
      },
      usage: { status: "unknown", costStatus: "unknown", tokens: {} },
    };
    const runtime = new FakeAgentRuntime({ scripts: { "exec-fail": script } });
    const handle = await runtime.startExecution(baseInput("exec-fail"));
    const result = await handle.wait();
    expect(result.status).toBe("failed");
    expect(result.code).toBe("sandbox_unsupported_on_host");
  });

  it("supports cancellation mid-flight", async () => {
    const script: FakeExecutionScript = {
      events: [
        {
          type: "started",
          executionId: "exec-cancel",
          agentId: "a1",
          runId: "r1",
        },
        { type: "assistant_text", executionId: "exec-cancel", text: "partial" },
        { type: "completed", executionId: "exec-cancel", resultText: "should-not-finish" },
      ],
      result: {
        executionId: "exec-cancel",
        status: "completed",
        resultText: "should-not-finish",
      },
      usage: { status: "unknown", costStatus: "unknown", tokens: {} },
    };
    const runtime = new FakeAgentRuntime({ scripts: { "exec-cancel": script } });
    const handle = await runtime.startExecution(baseInput("exec-cancel"));
    await runtime.cancelExecution("exec-cancel");
    const events = await collect(handle.stream());
    expect(events[events.length - 1]?.type).toBe("cancelled");
    const result = await handle.wait();
    expect(result.status).toBe("cancelled");
    expect(runtime.wasCancelled("exec-cancel")).toBe(true);
  });

  it("supports resume with reapplied tool/sandbox settings", async () => {
    const runtime = new FakeAgentRuntime();
    const handle = await runtime.resumeExecution({
      executionId: "exec-resume",
      opaqueAgentId: "agent-opaque-1",
      roleId: "reviewer",
      modelId: "fake-model",
      cwd: "/tmp/aep-work",
      tools: {
        tools: ["read"],
        disallowedTools: ["shell", "edit", "mcp", "task"],
      },
      sandbox: SANDBOX,
    });
    expect(handle.agentId.length).toBeGreaterThan(0);
    expect(runtime.wasResumed("exec-resume")).toBe(true);
    expect(runtime.getLastResumeInput()?.opaqueAgentId).toBe("agent-opaque-1");
    expect(runtime.getLastResumeInput()?.sandbox.enabled).toBe(true);
    const result = await handle.wait();
    expect(result.status).toBe("completed");
  });

  it("rejects resume without opaque agent id", async () => {
    const runtime = new FakeAgentRuntime();
    await expect(
      runtime.resumeExecution({
        executionId: "exec-bad-resume",
        opaqueAgentId: " ",
        roleId: "implementer",
        modelId: "fake-model",
        cwd: "/tmp/aep-work",
        tools: { tools: ["read"], disallowedTools: ["shell"] },
        sandbox: SANDBOX,
      }),
    ).rejects.toThrow(/opaqueAgentId/);
  });
});
