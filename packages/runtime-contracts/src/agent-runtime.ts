import type {
  AgentExecutionHandle,
  AgentExecutionInput,
  ResumeExecutionInput,
} from "./execution.js";
import type { ModelCatalogSnapshot, RuntimeHealth } from "./models.js";
import type { UsageResult } from "./usage.js";

/**
 * Minimal runtime boundary (architecture §8).
 * v1 production implementation is Cursor-only; FakeAgentRuntime is for tests.
 */
export type AgentRuntime = {
  readonly id: "cursor" | "fake";
  checkAvailability(): Promise<RuntimeHealth>;
  discoverModels(): Promise<ModelCatalogSnapshot>;
  startExecution(input: AgentExecutionInput): Promise<AgentExecutionHandle>;
  resumeExecution(input: ResumeExecutionInput): Promise<AgentExecutionHandle>;
  cancelExecution(executionId: string): Promise<void>;
  getUsage(executionId: string): Promise<UsageResult>;
};
