import type { RoleId, WorkflowAggregate } from "@aep/domain";
import type { AgentToolPolicy, ModelParamSelection } from "@aep/runtime-contracts";

/**
 * Snapshot required to reattach a Cursor/Fake session after process restart.
 * Tool allowlist, system prompt, sandbox, cwd, and model MUST be reapplied on resume.
 */
export type ExecutionSnapshot = {
  readonly executionId: string;
  readonly opaqueAgentId: string;
  readonly roleId: RoleId;
  readonly modelId: string;
  readonly cwd: string;
  readonly systemPrompt?: string;
  readonly tools: AgentToolPolicy;
  readonly startedAt: string;
  readonly catalogSnapshotId?: string;
  readonly modelParams?: ReadonlyArray<ModelParamSelection>;
  readonly modelSelectionRationale?: string;
};

export type ExecutionLifecycle = "idle" | "running" | "settled";

export type RecoveryOutcome =
  | "resumed"
  | "marked_interrupted"
  | "cancelled"
  | "already_terminal"
  | "no_action";

export type StoredRun = {
  readonly runId: string;
  readonly taskDescription: string;
  readonly aggregate: WorkflowAggregate;
  readonly executionLifecycle: ExecutionLifecycle;
  readonly execution?: ExecutionSnapshot;
  /** Convenience mirrors of execution ids for status views. */
  readonly executionId?: string;
  readonly agentId?: string;
  readonly lastResultText?: string;
  readonly recoveryOutcome?: RecoveryOutcome;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/**
 * In-memory run store. Survives "process restart" in tests by reusing the same instance
 * or by cloning via {@link InMemoryRunStore.fromSnapshot}.
 */
export class InMemoryRunStore {
  private readonly runs = new Map<string, StoredRun>();

  save(run: StoredRun): void {
    this.runs.set(run.runId, run);
  }

  get(runId: string): StoredRun | undefined {
    return this.runs.get(runId);
  }

  list(): ReadonlyArray<StoredRun> {
    return [...this.runs.values()];
  }

  snapshot(): ReadonlyArray<StoredRun> {
    return this.list().map((run) => ({ ...run }));
  }

  static fromSnapshot(runs: ReadonlyArray<StoredRun>): InMemoryRunStore {
    const store = new InMemoryRunStore();
    for (const run of runs) {
      store.save(run);
    }
    return store;
  }
}
