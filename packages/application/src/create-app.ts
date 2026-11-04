import { FakeAgentRuntime, type AgentRuntime } from "@aep/runtime-contracts";
import { InMemoryRunStore } from "./run-store.js";

export type AppDependencies = {
  readonly runtime: AgentRuntime;
  readonly runs: InMemoryRunStore;
  readonly now: () => string;
  readonly createId: (prefix: string) => string;
};

export type AepApplication = AppDependencies;

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultCreateId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${random}`;
}

/**
 * Application DI root. Default runtime is FakeAgentRuntime.
 * Production Cursor adapter is wired later without CLI importing runtime-cursor.
 */
export function createApp(overrides: Partial<AppDependencies> = {}): AepApplication {
  return {
    runtime: overrides.runtime ?? new FakeAgentRuntime(),
    runs: overrides.runs ?? new InMemoryRunStore(),
    now: overrides.now ?? defaultNow,
    createId: overrides.createId ?? defaultCreateId,
  };
}
