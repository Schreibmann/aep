import { Agent, Cursor, type SDKAgent, type ToolName } from "@cursor/sdk";
import { parseUnknownSdkMessage } from "./normalize.js";
import type {
  CursorSdkBridge,
  SdkAgentHandle,
  SdkCreateAgentInput,
  SdkResumeAgentInput,
  SdkRunHandle,
  SdkRunResult,
  SdkSandboxProbe,
  SdkStreamEvent,
} from "./sdk-bridge.js";

function toToolNames(names: ReadonlyArray<string>): ToolName[] {
  const out: ToolName[] = [];
  for (const name of names) {
    const open: string & {} = name;
    out.push(open);
  }
  return out;
}

function wrapSdkAgent(agent: SDKAgent): SdkAgentHandle {
  return {
    agentId: agent.agentId,
    async send(prompt: string): Promise<SdkRunHandle> {
      const run = await agent.send(prompt);
      return {
        id: run.id,
        agentId: run.agentId,
        async *stream(): AsyncIterable<SdkStreamEvent> {
          for await (const message of run.stream()) {
            yield parseUnknownSdkMessage(message);
          }
        },
        async wait(): Promise<SdkRunResult> {
          const result = await run.wait();
          if (result.status === "cancelled") {
            return { id: result.id, status: "cancelled" };
          }
          if (result.status === "error") {
            return {
              id: result.id,
              status: "error",
              ...(result.error?.code === undefined ? {} : { errorCode: result.error.code }),
              errorMessage: result.error?.message ?? "agent run failed",
            };
          }
          return {
            id: result.id,
            status: "finished",
            ...(result.result === undefined ? {} : { resultText: result.result }),
            ...(result.usage === undefined
              ? {}
              : {
                  usage: {
                    ...(result.usage.inputTokens === undefined
                      ? {}
                      : { inputTokens: result.usage.inputTokens }),
                    ...(result.usage.outputTokens === undefined
                      ? {}
                      : { outputTokens: result.usage.outputTokens }),
                    ...(result.usage.cacheReadTokens === undefined
                      ? {}
                      : { cacheReadTokens: result.usage.cacheReadTokens }),
                    ...(result.usage.cacheWriteTokens === undefined
                      ? {}
                      : { cacheWriteTokens: result.usage.cacheWriteTokens }),
                  },
                }),
          };
        },
        async cancel(): Promise<void> {
          await run.cancel();
        },
      };
    },
    async getUsage() {
      try {
        await agent.getUsage();
        return { status: "unknown" };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/feature_unavailable|not available|unsupported/i.test(message)) {
          return { status: "feature_unavailable" };
        }
        return { status: "unknown" };
      }
    },
    async close(): Promise<void> {
      await agent[Symbol.asyncDispose]();
    },
  };
}

function buildOptions(input: SdkCreateAgentInput) {
  return {
    apiKey: input.apiKey,
    model: { id: input.modelId },
    tools: toToolNames(input.tools),
    disallowedTools: toToolNames(input.disallowedTools),
    local: {
      cwd: input.cwd,
      sandboxOptions: { enabled: true as const },
    },
    ...(input.systemPrompt === undefined ? {} : { systemPrompt: input.systemPrompt }),
  };
}

/**
 * Live Cursor SDK bridge. `@cursor/sdk` is imported only here (plus validation scripts).
 */
export class LiveCursorSdkBridge implements CursorSdkBridge {
  async probeSandbox(): Promise<SdkSandboxProbe> {
    return {
      supported: true,
      detail: "live bridge defers host sandbox proof to Agent.create with sandboxOptions.enabled",
    };
  }

  async listModels(apiKey: string): Promise<ReadonlyArray<{ id: string; label: string }>> {
    const listed = await Cursor.models.list({ apiKey });
    const models: Array<{ id: string; label: string }> = [];
    for (const entry of listed) {
      const id = entry.id;
      if (typeof id === "string" && id.length > 0) {
        models.push({
          id,
          label: typeof entry.displayName === "string" ? entry.displayName : id,
        });
      }
    }
    return models;
  }

  async createAgent(input: SdkCreateAgentInput): Promise<SdkAgentHandle> {
    const agent = await Agent.create(buildOptions(input));
    return wrapSdkAgent(agent);
  }

  async resumeAgent(input: SdkResumeAgentInput): Promise<SdkAgentHandle> {
    const agent = await Agent.resume(input.agentId, buildOptions(input));
    return wrapSdkAgent(agent);
  }
}
