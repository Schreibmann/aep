export type ManagedWorktreeMetadata = {
  readonly taskId: string;
  readonly runId: string;
  readonly branchName: string;
  readonly worktreePath: string;
  readonly baseSha: string;
  readonly gitRoot: string;
  readonly commonDir: string;
  readonly createdAt: string;
};

/**
 * In-memory metadata store for managed worktrees (durable persistence lands with later tasks).
 */
export class WorktreeMetadataStore {
  private readonly byPath = new Map<string, ManagedWorktreeMetadata>();
  private readonly byRun = new Map<string, ManagedWorktreeMetadata>();

  save(meta: ManagedWorktreeMetadata): void {
    this.byPath.set(meta.worktreePath, meta);
    this.byRun.set(`${meta.taskId}/${meta.runId}`, meta);
  }

  getByPath(worktreePath: string): ManagedWorktreeMetadata | undefined {
    return this.byPath.get(worktreePath);
  }

  getByTaskRun(taskId: string, runId: string): ManagedWorktreeMetadata | undefined {
    return this.byRun.get(`${taskId}/${runId}`);
  }

  list(): ReadonlyArray<ManagedWorktreeMetadata> {
    return [...this.byPath.values()];
  }

  remove(worktreePath: string): void {
    const existing = this.byPath.get(worktreePath);
    if (existing !== undefined) {
      this.byPath.delete(worktreePath);
      this.byRun.delete(`${existing.taskId}/${existing.runId}`);
    }
  }
}
