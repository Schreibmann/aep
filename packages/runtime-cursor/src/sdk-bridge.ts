/**
 * Internal SDK surface used by CursorAgentRuntime.
 * Keeps `@cursor/sdk` types from escaping the package boundary.
 */

export type SdkModelInfo = {
  readonly id: string;
  readonly label: string;
  readonly params?: ReadonlyArray<{
    readonly id: string;
    readonly label?: string;
    readonly values: ReadonlyArray<{ readonly value: string; readonly label?: string }>;
  }>;
  readonly variants?: ReadonlyArray<{
    readonly label: string;
    readonly params: ReadonlyArray<{ readonly id: string; readonly value: string }>;
    readonly isDefault?: boolean;
    readonly requiresMaxMode?: boolean;
  }>;
};

export type SdkSandboxOptions = {
  readonly enabled: true;
};

export type SdkCreateAgentInput = {
  readonly apiKey: string;
  readonly modelId: string;
  readonly modelParams?: ReadonlyArray<{ readonly id: string; readonly value: string }>;
  readonly cwd: string;
  readonly systemPrompt?: string;
  readonly tools: ReadonlyArray<string>;
  readonly disallowedTools: ReadonlyArray<string>;
  readonly sandbox: SdkSandboxOptions;
};

export type SdkResumeAgentInput = SdkCreateAgentInput & {
  readonly agentId: string;
};

export type SdkRunResult = {
  readonly id: string;
  readonly status: "finished" | "error" | "cancelled";
  readonly resultText?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly cacheReadTokens?: number;
    readonly cacheWriteTokens?: number;
  };
};

export type SdkStreamEvent =
  | { readonly type: "assistant"; readonly text: string }
  | { readonly type: "tool_call"; readonly name: string; readonly status: string }
  | { readonly type: "status"; readonly status: string }
  | { readonly type: "thinking"; readonly text: string }
  | { readonly type: "unknown"; readonly rawType: string };

export type SdkRunHandle = {
  readonly id: string;
  readonly agentId: string;
  stream(): AsyncIterable<SdkStreamEvent>;
  wait(): Promise<SdkRunResult>;
  cancel(): Promise<void>;
};

export type SdkAgentHandle = {
  readonly agentId: string;
  send(prompt: string): Promise<SdkRunHandle>;
  getUsage(): Promise<
    | { readonly status: "ok"; readonly tokens: SdkRunResult["usage"]; readonly billedUsd?: number }
    | { readonly status: "feature_unavailable" }
    | { readonly status: "unknown" }
  >;
  close(): Promise<void>;
};

export type SdkSandboxProbe = {
  readonly supported: boolean;
  readonly detail: string;
};

/**
 * Injectable bridge so unit tests never call the live Cursor SDK.
 */
export type CursorSdkBridge = {
  probeSandbox(): Promise<SdkSandboxProbe>;
  listModels(apiKey: string): Promise<ReadonlyArray<SdkModelInfo>>;
  createAgent(input: SdkCreateAgentInput): Promise<SdkAgentHandle>;
  resumeAgent(input: SdkResumeAgentInput): Promise<SdkAgentHandle>;
};
