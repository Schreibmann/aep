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
import { BoundedEventBuffer, normalizeSdkStreamEvent } from "./normalize.js";
import type {
  CursorSdkBridge,
  SdkAgentHandle,
  SdkRunHandle,
  SdkStreamEvent,
} from "./sdk-bridge.js";

export type CursorAgentRuntimeOptions = {
  readonly credentials: SecureCredentialSource;
  readonly sdk?: CursorSdkBridge;
  readonly now?: () => string;
  /** Max retained normalized events per execution (ordered; oldest dropped). */
  readonly maxBufferedEvents?: number;
  /** Optional default wait timeout; cancel+fail closed when exceeded. */
  readonly defaultTimeoutMs?: number;
};

type ActiveExecution = {
  readonly agent: SdkAgentHandle;
  readonly run: SdkRunHandle;
  readonly buffer: BoundedEventBuffer;
  cancelled: boolean;
  timedOut: boolean;
  waitPromise?: Promise<AgentExecutionResult>;
};

function mapSdkEventsToAgentEvents(
  ctx: { readonly executionId: string; readonly agentId: string; readonly runId: string },
  events: AsyncIterable<SdkStreamEvent>,
  buffer: BoundedEventBuffer,
  isCancelled: () => boolean,
): AsyncIterable<AgentEvent> {
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<AgentEvent> {
      const started: AgentEvent = {
        type: "started",
        executionId: ctx.executionId,
        agentId: ctx.agentId,
        runId: ctx.runId,
      };
      buffer.push(started);
      yield started;
      for await (const event of events) {
        if (isCancelled()) {
          const cancelled: AgentEvent = { type: "cancelled", executionId: ctx.executionId };
          buffer.push(cancelled);
          yield cancelled;
          return;
        }
        const normalized = normalizeSdkStreamEvent(ctx, event);
        if (normalized === undefined) {
          continue;
        }
        buffer.push(normalized);
        yield normalized;
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
  private readonly maxBufferedEvents: number;
  private readonly defaultTimeoutMs: number | undefined;
  private readonly active = new Map<string, ActiveExecution>();

  constructor(options: CursorAgentRuntimeOptions) {
    this.credentials = options.credentials;
    this.sdk = options.sdk ?? new LiveCursorSdkBridge();
    this.now = options.now ?? (() => new Date().toISOString());
    this.maxBufferedEvents = options.maxBufferedEvents ?? 500;
    this.defaultTimeoutMs = options.defaultTimeoutMs;
  }

  /**
   * Important normalized events retained for the execution (ordered).
   * Empty after wait() finalizes and the agent is disposed.
   */
  getRecordedEvents(executionId: string): ReadonlyArray<AgentEvent> {
    return this.active.get(executionId)?.buffer.snapshot() ?? [];
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
      buffer: new BoundedEventBuffer(this.maxBufferedEvents),
      cancelled: false,
      timedOut: false,
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
      stream: () =>
        mapSdkEventsToAgentEvents(
          { executionId, agentId: agent.agentId, runId: run.id },
          run.stream(),
          active.buffer,
          () => active.cancelled || active.timedOut,
        ),
      wait: async (): Promise<AgentExecutionResult> => {
        if (active.waitPromise !== undefined) {
          return active.waitPromise;
        }
        active.waitPromise = (async () => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            if (active.cancelled) {
              active.buffer.push({ type: "cancelled", executionId });
              return { executionId, status: "cancelled" };
            }

            const waitPromise = run.wait();
            const result =
              this.defaultTimeoutMs === undefined
                ? await waitPromise
                : await Promise.race([
                    waitPromise,
                    new Promise<never>((_, reject) => {
                      timer = setTimeout(() => {
                        active.timedOut = true;
                        void run.cancel();
                        reject(new Error(`execution_timeout:${this.defaultTimeoutMs}`));
                      }, this.defaultTimeoutMs);
                    }),
                  ]);

            if (result.status === "cancelled" || active.cancelled) {
              active.buffer.push({ type: "cancelled", executionId });
              return { executionId, status: "cancelled" };
            }
            if (result.status === "error") {
              const failed: AgentEvent = {
                type: "failed",
                executionId,
                safeMessage: result.errorMessage ?? "Cursor agent run failed",
                ...(result.errorCode === undefined ? {} : { code: result.errorCode }),
              };
              active.buffer.push(failed);
              return {
                executionId,
                status: "failed",
                ...(result.errorCode === undefined ? {} : { code: result.errorCode }),
                safeMessage: result.errorMessage ?? "Cursor agent run failed",
              };
            }
            const completed: AgentEvent = {
              type: "completed",
              executionId,
              ...(result.resultText === undefined ? {} : { resultText: result.resultText }),
            };
            active.buffer.push(completed);
            return {
              executionId,
              status: "completed",
              ...(result.resultText === undefined ? {} : { resultText: result.resultText }),
            };
          } catch (error) {
            if (active.timedOut) {
              active.buffer.push({
                type: "failed",
                executionId,
                code: "execution_timeout",
                safeMessage: "Cursor agent execution timed out",
              });
              return {
                executionId,
                status: "failed",
                code: "execution_timeout",
                safeMessage: "Cursor agent execution timed out",
              };
            }
            throw error;
          } finally {
            if (timer !== undefined) {
              clearTimeout(timer);
            }
            await finalize();
          }
        })();
        return active.waitPromise;
      },
    };
  }
}
