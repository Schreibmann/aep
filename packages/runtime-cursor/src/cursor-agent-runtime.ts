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
  SdkCreateAgentInput,
  SdkRunHandle,
  SdkStreamEvent,
} from "./sdk-bridge.js";
import { AgentSessionRegistry, evaluateResumeSafety } from "./session-registry.js";

export type CursorAgentRuntimeOptions = {
  readonly credentials: SecureCredentialSource;
  readonly sdk?: CursorSdkBridge;
  readonly now?: () => string;
  /** Max retained normalized events per execution (ordered; oldest dropped). */
  readonly maxBufferedEvents?: number;
  /** Optional default wait timeout; cancel+fail closed when exceeded. */
  readonly defaultTimeoutMs?: number;
  readonly sessions?: AgentSessionRegistry;
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
  private readonly sessions: AgentSessionRegistry;
  private readonly active = new Map<string, ActiveExecution>();

  constructor(options: CursorAgentRuntimeOptions) {
    this.credentials = options.credentials;
    this.sdk = options.sdk ?? new LiveCursorSdkBridge();
    this.now = options.now ?? (() => new Date().toISOString());
    this.maxBufferedEvents = options.maxBufferedEvents ?? 500;
    this.defaultTimeoutMs = options.defaultTimeoutMs;
    this.sessions = options.sessions ?? new AgentSessionRegistry();
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
    const capturedAt = this.now();
    return {
      snapshotId: `snap_${capturedAt.replace(/[^0-9A-Za-z]/g, "")}`,
      capturedAt,
      models: models.map((model) => ({
        id: model.id,
        label: model.label,
        billingCategory: "unknown",
        ...(model.params === undefined
          ? {}
          : {
              parameters: model.params.map((parameter) => ({
                id: parameter.id,
                ...(parameter.label === undefined ? {} : { label: parameter.label }),
                values: parameter.values.map((value) => ({
                  value: value.value,
                  ...(value.label === undefined ? {} : { label: value.label }),
                })),
              })),
            }),
        ...(model.variants === undefined
          ? {}
          : {
              variants: model.variants.map((variant) => ({
                label: variant.label,
                params: variant.params,
                ...(variant.isDefault === undefined ? {} : { isDefault: variant.isDefault }),
                ...(variant.requiresMaxMode === undefined
                  ? {}
                  : { requiresMaxMode: variant.requiresMaxMode }),
              })),
            }),
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
    const createInput = this.toCreateInput(apiKey, input);
    const agent = await this.sdk.createAgent(createInput);

    try {
      this.rememberSession(agent.agentId, input);
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
    const recorded = this.sessions.get(input.opaqueAgentId);
    const safety = evaluateResumeSafety({
      requestedRoleId: input.roleId,
      recorded,
      ...(input.forceFreshSession === undefined
        ? {}
        : { forceFreshSession: input.forceFreshSession }),
    });

    if (!safety.ok) {
      return this.startFreshAfterUnsafeResume(apiKey, input, safety.reason);
    }

    const resumeInput = {
      ...this.toCreateInput(apiKey, input),
      agentId: input.opaqueAgentId,
    };

    try {
      const agent = await this.sdk.resumeAgent(resumeInput);
      try {
        this.rememberSession(agent.agentId, input);
        const prompt = input.prompt ?? "";
        const run = await agent.send(prompt.length > 0 ? prompt : "Continue the previous task.");
        return this.attachHandle(input.executionId, agent, run);
      } catch (error) {
        await agent.close();
        throw error;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return this.startFreshAfterUnsafeResume(apiKey, input, `resume_failed:${detail}`);
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

  private toCreateInput(
    apiKey: string,
    input: AgentExecutionInput | ResumeExecutionInput,
  ): SdkCreateAgentInput {
    return {
      apiKey,
      modelId: input.modelId,
      cwd: input.cwd,
      tools: input.tools.tools,
      disallowedTools: input.tools.disallowedTools,
      sandbox: { enabled: true },
      ...(input.systemPrompt === undefined ? {} : { systemPrompt: input.systemPrompt }),
      ...(input.modelParams === undefined ? {} : { modelParams: input.modelParams }),
      ...(input.settingSources === undefined ? {} : { settingSources: input.settingSources }),
    };
  }

  private rememberSession(
    agentId: string,
    input: AgentExecutionInput | ResumeExecutionInput,
  ): void {
    this.sessions.remember({
      agentId,
      roleId: input.roleId,
      tools: input.tools,
      modelId: input.modelId,
      cwd: input.cwd,
    });
  }

  private async startFreshAfterUnsafeResume(
    apiKey: string,
    input: ResumeExecutionInput,
    reason: string,
  ): Promise<AgentExecutionHandle> {
    const agent = await this.sdk.createAgent(this.toCreateInput(apiKey, input));
    try {
      this.rememberSession(agent.agentId, input);
      const prompt = input.prompt ?? "";
      const run = await agent.send(
        prompt.length > 0
          ? prompt
          : "Continue with a fresh session; prior agent context was not safely resumable.",
      );
      return this.attachHandle(input.executionId, agent, run, {
        contextReset: true,
        contextResetReason: reason,
      });
    } catch (error) {
      await agent.close();
      throw error;
    }
  }

  private attachHandle(
    executionId: string,
    agent: SdkAgentHandle,
    run: SdkRunHandle,
    continuity?: { readonly contextReset: true; readonly contextResetReason: string },
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
      ...(continuity === undefined
        ? {}
        : {
            contextReset: continuity.contextReset,
            contextResetReason: continuity.contextResetReason,
          }),
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
