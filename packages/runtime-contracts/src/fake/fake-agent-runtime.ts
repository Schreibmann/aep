import type { AgentRuntime } from "../agent-runtime.js";
import type { AgentEvent } from "../events.js";
import type {
  AgentExecutionHandle,
  AgentExecutionInput,
  AgentExecutionResult,
  ResumeExecutionInput,
} from "../execution.js";
import type { ModelCatalogSnapshot, RuntimeHealth } from "../models.js";
import type { UsageResult, UsageTokenCounts } from "../usage.js";

export type FakeExecutionScript = {
  readonly events: ReadonlyArray<AgentEvent>;
  readonly result: AgentExecutionResult;
  readonly usage: UsageResult;
  /** If set, startExecution/resumeExecution reject before streaming. */
  readonly startError?: { readonly code: string; readonly message: string };
  /**
   * When true, wait() blocks until {@link FakeAgentRuntime.releaseWait} for this executionId.
   * Used to simulate process crash mid-execution in recovery tests.
   */
  readonly holdWait?: boolean;
};

export type FakeAgentRuntimeOptions = {
  readonly health?: RuntimeHealth;
  readonly catalog?: ModelCatalogSnapshot;
  /** Scripts keyed by executionId. */
  readonly scripts?: Readonly<Record<string, FakeExecutionScript>>;
  /** Used when executionId has no dedicated script. */
  readonly defaultScript?: FakeExecutionScript;
};

class FakeExecutionHandle implements AgentExecutionHandle {
  readonly executionId: string;
  readonly agentId: string;
  readonly runId: string;
  private readonly events: ReadonlyArray<AgentEvent>;
  private readonly result: AgentExecutionResult;
  private readonly cancelled: () => boolean;
  private readonly beforeWait: (() => Promise<void>) | undefined;
  private readonly markConsumed: () => void;

  constructor(input: {
    executionId: string;
    agentId: string;
    runId: string;
    events: ReadonlyArray<AgentEvent>;
    result: AgentExecutionResult;
    cancelled: () => boolean;
    beforeWait?: () => Promise<void>;
    markConsumed: () => void;
  }) {
    this.executionId = input.executionId;
    this.agentId = input.agentId;
    this.runId = input.runId;
    this.events = input.events;
    this.result = input.result;
    this.cancelled = input.cancelled;
    this.beforeWait = input.beforeWait;
    this.markConsumed = input.markConsumed;
  }

  async *stream(): AsyncIterable<AgentEvent> {
    for (const event of this.events) {
      if (this.cancelled()) {
        yield { type: "cancelled", executionId: this.executionId };
        return;
      }
      yield event;
    }
  }

  async wait(): Promise<AgentExecutionResult> {
    if (this.beforeWait !== undefined) {
      await this.beforeWait();
    }
    // Drain stream semantics: consumers may call wait without stream.
    for await (const _event of this.stream()) {
      // intentionally drain
    }
    this.markConsumed();
    if (this.cancelled()) {
      return {
        executionId: this.executionId,
        status: "cancelled",
      };
    }
    return this.result;
  }
}

function defaultCompletedScript(executionId: string): FakeExecutionScript {
  const agentId = `fake-agent-${executionId}`;
  const runId = `fake-run-${executionId}`;
  return {
    events: [
      { type: "started", executionId, agentId, runId },
      { type: "assistant_text", executionId, text: "OK" },
      {
        type: "usage",
        executionId,
        inputTokens: 1,
        outputTokens: 1,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      { type: "completed", executionId, resultText: "OK" },
    ],
    result: {
      executionId,
      status: "completed",
      resultText: "OK",
    },
    usage: {
      status: "unknown",
      costStatus: "unknown",
      tokens: { inputTokens: 1, outputTokens: 1 },
    },
  };
}

/**
 * Deterministic test double. No network, no Cursor SDK.
 */
export class FakeAgentRuntime implements AgentRuntime {
  readonly id = "fake" as const;
  private readonly health: RuntimeHealth;
  private readonly catalog: ModelCatalogSnapshot;
  private readonly scripts: Map<string, FakeExecutionScript>;
  private readonly defaultScript: FakeExecutionScript | undefined;
  private readonly cancelledIds = new Set<string>();
  private readonly usageByExecution = new Map<string, UsageResult>();
  private readonly resumedIds = new Set<string>();
  private readonly waitGates = new Map<
    string,
    { readonly promise: Promise<void>; resolve: () => void }
  >();
  private lastResumeInput: ResumeExecutionInput | undefined;

  constructor(options: FakeAgentRuntimeOptions = {}) {
    this.health = options.health ?? {
      ok: true,
      runtimeId: "fake",
      detail: "FakeAgentRuntime ready",
      sandboxReady: true,
    };
    this.catalog = options.catalog ?? {
      capturedAt: "2026-11-05T00:00:00.000Z",
      models: [
        {
          id: "fake-model",
          label: "Fake Model",
          billingCategory: "unknown",
        },
      ],
    };
    this.scripts = new Map(Object.entries(options.scripts ?? {}));
    this.defaultScript = options.defaultScript;
  }

  async checkAvailability(): Promise<RuntimeHealth> {
    return this.health;
  }

  async discoverModels(): Promise<ModelCatalogSnapshot> {
    return this.catalog;
  }

  async startExecution(input: AgentExecutionInput): Promise<AgentExecutionHandle> {
    this.assertSandbox(input.sandbox.enabled);
    return this.createHandle(input.executionId, false);
  }

  async resumeExecution(input: ResumeExecutionInput): Promise<AgentExecutionHandle> {
    this.assertSandbox(input.sandbox.enabled);
    if (input.opaqueAgentId.trim().length === 0) {
      throw new Error("resumeExecution requires opaqueAgentId");
    }
    this.lastResumeInput = input;
    this.resumedIds.add(input.executionId);
    // A resumed session must not stay blocked on a pre-crash wait gate.
    this.releaseWait(input.executionId);
    return this.createHandle(input.executionId, true);
  }

  /**
   * Release a held wait() for crash-simulation scripts (`holdWait: true`).
   */
  releaseWait(executionId: string): void {
    const gate = this.waitGates.get(executionId);
    if (gate !== undefined) {
      gate.resolve();
      this.waitGates.delete(executionId);
    }
  }

  getLastResumeInput(): ResumeExecutionInput | undefined {
    return this.lastResumeInput;
  }

  async cancelExecution(executionId: string): Promise<void> {
    this.cancelledIds.add(executionId);
  }

  async getUsage(executionId: string): Promise<UsageResult> {
    const stored = this.usageByExecution.get(executionId);
    if (stored !== undefined) {
      return stored;
    }
    const script = this.resolveScript(executionId);
    return script.usage;
  }

  wasResumed(executionId: string): boolean {
    return this.resumedIds.has(executionId);
  }

  wasCancelled(executionId: string): boolean {
    return this.cancelledIds.has(executionId);
  }

  private assertSandbox(enabled: true): void {
    if (enabled !== true) {
      throw new Error("sandbox must remain enabled");
    }
  }

  private resolveScript(executionId: string): FakeExecutionScript {
    const script = this.scripts.get(executionId) ?? this.defaultScript;
    if (script !== undefined) {
      return script;
    }
    return defaultCompletedScript(executionId);
  }

  private createHandle(executionId: string, resumed: boolean): AgentExecutionHandle {
    const script = this.resolveScript(executionId);
    if (script.startError !== undefined) {
      throw new Error(`${script.startError.code}: ${script.startError.message}`);
    }
    this.usageByExecution.set(executionId, script.usage);

    if (script.holdWait === true && !resumed && !this.waitGates.has(executionId)) {
      let resolveGate = () => {
        // placeholder replaced below
      };
      const promise = new Promise<void>((resolve) => {
        resolveGate = resolve;
      });
      this.waitGates.set(executionId, { promise, resolve: resolveGate });
    }

    const started = script.events.find((event) => event.type === "started");
    const agentId =
      started !== undefined && started.type === "started"
        ? started.agentId
        : resumed
          ? `fake-resumed-${executionId}`
          : `fake-agent-${executionId}`;
    const runId =
      started !== undefined && started.type === "started"
        ? started.runId
        : `fake-run-${executionId}`;

    const gatePromise = this.waitGates.get(executionId)?.promise;

    return new FakeExecutionHandle({
      executionId,
      agentId,
      runId,
      events: script.events,
      result: script.result,
      cancelled: () => this.cancelledIds.has(executionId),
      ...(gatePromise === undefined
        ? {}
        : {
            beforeWait: async () => {
              await gatePromise;
            },
          }),
      markConsumed: () => {
        // reserved for future bookkeeping
      },
    });
  }
}

export function createFeatureUnavailableUsage(tokens: UsageTokenCounts = {}): UsageResult {
  return {
    status: "feature_unavailable",
    costStatus: "unknown",
    tokens,
  };
}
