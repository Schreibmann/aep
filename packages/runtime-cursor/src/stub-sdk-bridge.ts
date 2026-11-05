import type {
  CursorSdkBridge,
  SdkAgentHandle,
  SdkCreateAgentInput,
  SdkModelInfo,
  SdkResumeAgentInput,
  SdkRunHandle,
  SdkRunResult,
  SdkSandboxProbe,
  SdkStreamEvent,
} from "./sdk-bridge.js";

export type StubSdkBridgeOptions = {
  readonly sandboxSupported?: boolean;
  readonly sandboxDetail?: string;
  readonly models?: ReadonlyArray<SdkModelInfo>;
  readonly runResult?: SdkRunResult;
  readonly streamEvents?: ReadonlyArray<SdkStreamEvent>;
  readonly createError?: { readonly code: string; readonly message: string };
  readonly usageStatus?: "ok" | "feature_unavailable" | "unknown";
  /** Artificial wait latency for cancel/timeout contract tests. */
  readonly waitDelayMs?: number;
};

/**
 * Deterministic SDK double for contract tests (no network, no @cursor/sdk I/O).
 */
export class StubCursorSdkBridge implements CursorSdkBridge {
  readonly created: SdkCreateAgentInput[] = [];
  readonly resumed: SdkResumeAgentInput[] = [];
  private readonly sandboxSupported: boolean;
  private readonly sandboxDetail: string;
  private readonly models: ReadonlyArray<SdkModelInfo>;
  private readonly runResult: SdkRunResult;
  private readonly streamEvents: ReadonlyArray<SdkStreamEvent>;
  private readonly createError: { readonly code: string; readonly message: string } | undefined;
  private readonly usageStatus: "ok" | "feature_unavailable" | "unknown";
  private readonly waitDelayMs: number;
  private nextAgentSeq = 1;

  constructor(options: StubSdkBridgeOptions = {}) {
    this.sandboxSupported = options.sandboxSupported ?? true;
    this.sandboxDetail = options.sandboxDetail ?? "stub sandbox ready";
    this.models = options.models ?? [{ id: "stub-model", label: "Stub Model" }];
    this.runResult = options.runResult ?? {
      id: "run_stub",
      status: "finished",
      resultText: "stub-ok",
      usage: { inputTokens: 1, outputTokens: 1 },
    };
    this.streamEvents = options.streamEvents ?? [
      { type: "assistant", text: "stub-ok" },
      { type: "status", status: "finished" },
    ];
    this.createError = options.createError;
    this.usageStatus = options.usageStatus ?? "unknown";
    this.waitDelayMs = options.waitDelayMs ?? 0;
  }

  async probeSandbox(): Promise<SdkSandboxProbe> {
    return {
      supported: this.sandboxSupported,
      detail: this.sandboxDetail,
    };
  }

  async listModels(_apiKey: string): Promise<ReadonlyArray<SdkModelInfo>> {
    return this.models;
  }

  async createAgent(input: SdkCreateAgentInput): Promise<SdkAgentHandle> {
    this.assertSandbox(input);
    if (this.createError !== undefined) {
      throw new Error(`${this.createError.code}: ${this.createError.message}`);
    }
    this.created.push(input);
    const agentId = `stub-agent-${this.nextAgentSeq}`;
    this.nextAgentSeq += 1;
    return this.makeAgent(agentId, input);
  }

  async resumeAgent(input: SdkResumeAgentInput): Promise<SdkAgentHandle> {
    this.assertSandbox(input);
    if (input.agentId.trim().length === 0) {
      throw new Error("resume requires agentId");
    }
    this.resumed.push(input);
    return this.makeAgent(input.agentId, input);
  }

  private assertSandbox(input: SdkCreateAgentInput): void {
    if (input.sandbox.enabled !== true) {
      throw new Error("sandbox must be enabled");
    }
    if (!this.sandboxSupported) {
      throw new Error(`sandbox_unsupported: ${this.sandboxDetail}`);
    }
  }

  private makeAgent(agentId: string, _input: SdkCreateAgentInput): SdkAgentHandle {
    const bridge = this;
    let closed = false;
    return {
      agentId,
      async send(prompt: string): Promise<SdkRunHandle> {
        if (closed) {
          throw new Error("agent closed");
        }
        if (prompt.trim().length === 0) {
          throw new Error("empty prompt");
        }
        const runId = `${bridge.runResult.id}-${agentId}`;
        let cancelled = false;
        return {
          id: runId,
          agentId,
          async *stream(): AsyncIterable<SdkStreamEvent> {
            for (const event of bridge.streamEvents) {
              if (cancelled) {
                return;
              }
              yield event;
            }
          },
          async wait(): Promise<SdkRunResult> {
            if (bridge.waitDelayMs > 0) {
              await new Promise<void>((resolve) => {
                setTimeout(resolve, bridge.waitDelayMs);
              });
            }
            if (cancelled) {
              return { id: runId, status: "cancelled" };
            }
            return { ...bridge.runResult, id: runId };
          },
          async cancel(): Promise<void> {
            cancelled = true;
          },
        };
      },
      async getUsage() {
        if (bridge.usageStatus === "feature_unavailable") {
          return { status: "feature_unavailable" };
        }
        if (bridge.usageStatus === "ok") {
          return {
            status: "ok",
            tokens: bridge.runResult.usage ?? {},
          };
        }
        return { status: "unknown" };
      },
      async close(): Promise<void> {
        closed = true;
      },
    };
  }
}
