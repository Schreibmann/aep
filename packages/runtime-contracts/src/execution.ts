import type { RoleId } from "@aep/domain";
import type { AgentEvent } from "./events.js";
import type { ModelParamSelection } from "./models.js";

export type AgentToolPolicy = {
  readonly tools: ReadonlyArray<string>;
  readonly disallowedTools: ReadonlyArray<string>;
};

export type AgentSandboxOptions = {
  /** Local Cursor sessions MUST enable sandbox. Fake mirrors the flag only. */
  readonly enabled: true;
};

/** Mirrors Cursor SettingSource without importing @cursor/sdk. */
export type AgentSettingSource = "project" | "user" | "team" | "mdm" | "plugins" | "all";

export type AgentExecutionInput = {
  readonly executionId: string;
  readonly roleId: RoleId;
  readonly prompt: string;
  readonly modelId: string;
  readonly cwd: string;
  readonly systemPrompt?: string;
  readonly tools: AgentToolPolicy;
  readonly sandbox: AgentSandboxOptions;
  readonly modelParams?: ReadonlyArray<ModelParamSelection>;
  readonly catalogSnapshotId?: string;
  readonly settingSources?: ReadonlyArray<AgentSettingSource>;
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
  readonly modelParams?: ReadonlyArray<ModelParamSelection>;
  readonly catalogSnapshotId?: string;
  readonly settingSources?: ReadonlyArray<AgentSettingSource>;
  /**
   * When true, skip Agent.resume and open a fresh session, marking context reset.
   * Used when prior role isolation would be violated (e.g. Reviewer vs Implementer).
   */
  readonly forceFreshSession?: boolean;
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
  /**
   * True when continuity was not preserved (resume failed or role isolation forced a new session).
   * Callers MUST NOT pretend prior context is still available.
   */
  readonly contextReset?: boolean;
  readonly contextResetReason?: string;
  stream(): AsyncIterable<AgentEvent>;
  wait(): Promise<AgentExecutionResult>;
};
