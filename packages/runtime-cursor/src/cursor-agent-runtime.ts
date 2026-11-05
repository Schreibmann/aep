import type {
  AgentEvent,
  AgentExecutionHandle,
  AgentExecutionInput,
  AgentExecutionResult,
  AgentRuntime,
  ModelCatalogSnapshot,
  ResumeExecutionInput,
  RuntimeHealth,
  UsageResult,
} from "@aep/runtime-contracts";
import {
  assertSandboxReady,
  requireEnabledSandbox,
  resolveCursorApiKeyForSdk,
  type SecureCredentialSource,
} from "@aep/security";
import { LiveCursorSdkBridge } from "./live-sdk-bridge.js";
import type { CursorSdkBridge, SdkAgentHandle, SdkRunHandle } from "./sdk-bridge.js";

export type CursorAgentRuntimeOptions = {
  readonly credentials: SecureCredentialSource;
  readonly sdk?: CursorSdkBridge;
  readonly now?: () => string;
};

type ActiveExecution = {
  readonly agent: SdkAgentHandle;
  readonly run: SdkRunHandle;
  readonly events: AgentEvent[];
  cancelled: boolean;
  waitPromise?: Promise<AgentExecutionResult>;
};

function mapSdkEventsToAgentEvents(
  executionId: string,
  agentId: string,
  runId: string,
  events: AsyncIterable<{
    readonly type: string;
    readonly text?: string;
    readonly name?: string;
    readonly status?: string;
    readonly rawType?: string;
  }>,
): AsyncIterable<AgentEvent> {
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<AgentEvent> {
      yield { type: "started", executionId, agentId, runId };
      for await (const event of events) {
        if (event.type === "assistant" && event.text !== undefined) {
          yield { type: "assistant_text", executionId, text: event.text };
          continue;
        }
        if (event.type === "tool_call" && event.name !== undefined) {
          yield {
            type: "tool_activity",
            executionId,
            toolName: event.name,
            status: event.status ?? "unknown",
          };
          continue;
        }
        if (event.type === "status" && event.status !== undefined) {
          yield { type: "status", executionId, status: event.status };
          continue;
        }
        // thinking / unknown: skip private reasoning; emit opaque status only for unknown
        if (event.type === "unknown") {
          yield {
            type: "status",
            executionId,
            status: `unknown_event:${event.rawType ?? "n/a"}`,
          };
        }
      }
    },
  };
}

/**
 * Production Cursor AgentRuntime. SDK types stay inside runtime-cursor.
 */
export class CursorAgentRuntime implements AgentRuntime {
  readonly id = "cursor" as const;
  private readonly credentials: SecureCredentialSource;
  private readonly sdk: CursorSdkBridge;
  private readonly now: () => string;
  private readonly active = new Map<string, ActiveExecution>();

  constructor(options: CursorAgentRuntimeOptions) {
    this.credentials = options.credentials;
    this.sdk = options.sdk ?? new LiveCursorSdkBridge();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async checkAvailability(): Promise<RuntimeHealth> {
    const probe = await this.sdk.probeSandbox();
    if (!probe.supported) {
      return {
        ok: false,
        runtimeId: "cursor",
        detail: probe.detail,
        sandboxReady: false,
      };
    }
    try {
      resolveCursorApiKeyForSdk(this.credentials);
      return {
        ok: true,
        runtimeId: "cursor",
        detail: "Cursor runtime credentials and sandbox probe OK",
        sandboxReady: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        runtimeId: "cursor",
        detail: message,
        sandboxReady: true,
      };
    }
  }

  async discoverModels(): Promise<ModelCatalogSnapshot> {
    const apiKey = resolveCursorApiKeyForSdk(this.credentials);
    const models = await this.sdk.listModels(apiKey);
    return {
      capturedAt: this.now(),
      models: models.map((model) => ({
        id: model.id,
        label: model.label,
        billingCategory: "unknown",
      })),
    };
  }

  async startExecution(input: AgentExecutionInput): Promise<AgentExecutionHandle> {
    requireEnabledSandbox(input.sandbox);
    const probe = await this.sdk.probeSandbox();
    assertSandboxReady({
      sandboxSupported: probe.supported,
      detail: probe.detail,
    });

    const apiKey = resolveCursorApiKeyForSdk(this.credentials);
    const agent = await this.sdk.createAgent({
      apiKey,
      modelId: input.modelId,
      cwd: input.cwd,
      tools: input.tools.tools,
      disallowedTools: input.tools.disallowedTools,
      sandbox: { enabled: true },
      ...(input.systemPrompt === undefined ? {} : { systemPrompt: input.systemPrompt }),
    });

    try {
      const run = await agent.send(input.prompt);
      return this.attachHandle(input.executionId, agent, run);
    } catch (error) {
      await agent.close();
      throw error;
    }
  }

  async resumeExecution(input: ResumeExecutionInput): Promise<AgentExecutionHandle> {
    requireEnabledSandbox(input.sandbox);
    const probe = await this.sdk.probeSandbox();
    assertSandboxReady({
      sandboxSupported: probe.supported,
      detail: probe.detail,
    });

    const apiKey = resolveCursorApiKeyForSdk(this.credentials);
    const agent = await this.sdk.resumeAgent({
      agentId: input.opaqueAgentId,
      apiKey,
      modelId: input.modelId,
      cwd: input.cwd,
      tools: input.tools.tools,
      disallowedTools: input.tools.disallowedTools,
      sandbox: { enabled: true },
      ...(input.systemPrompt === undefined ? {} : { systemPrompt: input.systemPrompt }),
    });

    try {
      const prompt = input.prompt ?? "";
      const run = await agent.send(prompt.length > 0 ? prompt : "Continue the previous task.");
      return this.attachHandle(input.executionId, agent, run);
    } catch (error) {
      await agent.close();
      throw error;
    }
  }

  async cancelExecution(executionId: string): Promise<void> {
    const active = this.active.get(executionId);
    if (active === undefined) {
      return;
    }
    active.cancelled = true;
    await active.run.cancel();
  }

  async getUsage(executionId: string): Promise<UsageResult> {
    const active = this.active.get(executionId);
    if (active === undefined) {
      return { status: "unknown", costStatus: "unknown", tokens: {} };
    }
    const usage = await active.agent.getUsage();
    if (usage.status === "feature_unavailable") {
      return { status: "feature_unavailable", costStatus: "unknown", tokens: {} };
    }
    if (usage.status === "ok") {
      return {
        status: "ok",
        costStatus: usage.billedUsd === undefined ? "unknown" : "provider_reported",
        tokens: {
          ...(usage.tokens?.inputTokens === undefined
            ? {}
            : { inputTokens: usage.tokens.inputTokens }),
          ...(usage.tokens?.outputTokens === undefined
            ? {}
            : { outputTokens: usage.tokens.outputTokens }),
          ...(usage.tokens?.cacheReadTokens === undefined
            ? {}
            : { cacheReadTokens: usage.tokens.cacheReadTokens }),
          ...(usage.tokens?.cacheWriteTokens === undefined
            ? {}
            : { cacheWriteTokens: usage.tokens.cacheWriteTokens }),
        },
        ...(usage.billedUsd === undefined ? {} : { billedUsd: usage.billedUsd }),
      };
    }
    return { status: "unknown", costStatus: "unknown", tokens: {} };
  }

  private attachHandle(
    executionId: string,
    agent: SdkAgentHandle,
    run: SdkRunHandle,
  ): AgentExecutionHandle {
    const active: ActiveExecution = {
      agent,
      run,
      events: [],
      cancelled: false,
    };
    this.active.set(executionId, active);

    const finalize = async (): Promise<void> => {
      try {
        await agent.close();
      } finally {
        this.active.delete(executionId);
      }
    };

    return {
      executionId,
      agentId: agent.agentId,
      runId: run.id,
      stream: () => mapSdkEventsToAgentEvents(executionId, agent.agentId, run.id, run.stream()),
      wait: async (): Promise<AgentExecutionResult> => {
        if (active.waitPromise !== undefined) {
          return active.waitPromise;
        }
        active.waitPromise = (async () => {
          try {
            if (active.cancelled) {
              return { executionId, status: "cancelled" };
            }
            const result = await run.wait();
            if (result.status === "cancelled" || active.cancelled) {
              return { executionId, status: "cancelled" };
            }
            if (result.status === "error") {
              return {
                executionId,
                status: "failed",
                ...(result.errorCode === undefined ? {} : { code: result.errorCode }),
                safeMessage: result.errorMessage ?? "Cursor agent run failed",
              };
            }
            return {
              executionId,
              status: "completed",
              ...(result.resultText === undefined ? {} : { resultText: result.resultText }),
            };
          } finally {
            await finalize();
          }
        })();
        return active.waitPromise;
      },
    };
  }
}
