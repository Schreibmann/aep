import type { RoleId } from "@aep/domain";
import type { AgentEvent } from "./events.js";

export type AgentToolPolicy = {
  readonly tools: ReadonlyArray<string>;
  readonly disallowedTools: ReadonlyArray<string>;
};

export type AgentSandboxOptions = {
  /** Local Cursor sessions MUST enable sandbox. Fake mirrors the flag only. */
  readonly enabled: true;
};

export type AgentExecutionInput = {
  readonly executionId: string;
  readonly roleId: RoleId;
  readonly prompt: string;
  readonly modelId: string;
  readonly cwd: string;
  readonly systemPrompt?: string;
  readonly tools: AgentToolPolicy;
  readonly sandbox: AgentSandboxOptions;
};

export type ResumeExecutionInput = {
  readonly executionId: string;
  readonly opaqueAgentId: string;
  readonly roleId: RoleId;
  readonly prompt?: string;
  readonly modelId: string;
  readonly cwd: string;
  readonly systemPrompt?: string;
  readonly tools: AgentToolPolicy;
  readonly sandbox: AgentSandboxOptions;
};

export type AgentExecutionResult = {
  readonly executionId: string;
  readonly status: "completed" | "failed" | "cancelled";
  readonly resultText?: string;
  readonly code?: string;
  readonly safeMessage?: string;
};

export type AgentExecutionHandle = {
  readonly executionId: string;
  readonly agentId: string;
  readonly runId: string;
  stream(): AsyncIterable<AgentEvent>;
  wait(): Promise<AgentExecutionResult>;
};
