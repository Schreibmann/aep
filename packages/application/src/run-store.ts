import type { WorkflowAggregate } from "@aep/domain";

export type StoredRun = {
  readonly runId: string;
  readonly taskDescription: string;
  readonly aggregate: WorkflowAggregate;
  readonly executionId?: string;
  readonly agentId?: string;
  readonly lastResultText?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/**
 * In-memory run store for CLI skeleton until AEP-020 persistence lands.
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
}
