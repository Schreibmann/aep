import { reduceWorkflowAll } from "@aep/domain";
import {
  createManagedWorktree,
  type ManagedWorktreeMetadata,
  WorktreeMetadataStore,
} from "@aep/git-workspaces";
import type { AepApplication } from "./create-app.js";
import { ApplicationError } from "./errors.js";
import type { StoredRun } from "./run-store.js";

export type PrepareWorkspaceInput = {
  readonly runId: string;
  readonly repoPath: string;
  readonly worktreesRoot: string;
  readonly taskId: string;
};

export type PrepareWorkspaceResult = {
  readonly runId: string;
  readonly status: string;
  readonly worktree: ManagedWorktreeMetadata;
};

/**
 * Create an isolated Git worktree and advance workflow past preparing_workspace.
 * Does not mutate the primary working tree beyond `git worktree add`.
 */
export function prepareWorkspace(
  app: AepApplication,
  input: PrepareWorkspaceInput,
): PrepareWorkspaceResult {
  const runId = input.runId.trim();
  const stored = app.runs.get(runId);
  if (stored === undefined) {
    throw new ApplicationError("run_not_found", `No run found for id ${runId}`);
  }
  if (stored.aggregate.run.status !== "preparing_workspace") {
    throw new ApplicationError(
      "invalid_run_status",
      `prepareWorkspace requires preparing_workspace, got ${stored.aggregate.run.status}`,
    );
  }

  const metadata = new WorktreeMetadataStore();
  let worktree: ManagedWorktreeMetadata;
  try {
    worktree = createManagedWorktree({
      repoPath: input.repoPath,
      worktreesRoot: input.worktreesRoot,
      taskId: input.taskId,
      runId,
      metadata,
      createdAt: app.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ApplicationError("worktree_create_failed", message);
  }

  const aggregate = reduceWorkflowAll(stored.aggregate, [
    { type: "workspace_created", at: app.now() },
  ]);
  const next: StoredRun = {
    ...stored,
    aggregate,
    worktreePath: worktree.worktreePath,
    worktreeBranch: worktree.branchName,
    updatedAt: app.now(),
  };
  app.runs.save(next);

  return {
    runId,
    status: aggregate.run.status,
    worktree,
  };
}
