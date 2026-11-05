import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildAepBranchName, buildWorktreeDirectoryName } from "./branch-names.ts";
import { GitWorkspacesError } from "./errors.ts";
import { runGit } from "./git-exec.ts";
import { inspectRepository } from "./inspect.ts";
import type { ManagedWorktreeMetadata, WorktreeMetadataStore } from "./worktree-meta.ts";

export type CreateManagedWorktreeInput = {
  readonly repoPath: string;
  readonly taskId: string;
  readonly runId: string;
  /** Immutable base commit; defaults to current HEAD. */
  readonly baseSha?: string;
  /** Directory that will contain the new worktree folder. */
  readonly worktreesRoot: string;
  readonly createdAt?: string;
  readonly metadata?: WorktreeMetadataStore;
};

export type RemoveManagedWorktreeInput = {
  readonly repoPath: string;
  readonly worktreePath: string;
  /** Required safety latch — cleanup never runs without explicit confirm. */
  readonly confirm: true;
  /** When false/omitted, refuse to remove a dirty worktree. */
  readonly allowDirty?: boolean;
  readonly metadata?: WorktreeMetadataStore;
};

function samePath(a: string, b: string): boolean {
  const left = resolve(a);
  const right = resolve(b);
  if (process.platform === "win32") {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

/**
 * Ensure a path is a worktree of the expected Git common directory.
 */
export function validateWorktreeBelongsToRepo(
  worktreePath: string,
  expectedCommonDir: string,
): void {
  const inspection = inspectRepository(worktreePath);
  if (!samePath(inspection.commonDir, expectedCommonDir)) {
    throw new GitWorkspacesError(
      "worktree_common_dir_mismatch",
      `Worktree ${worktreePath} common dir ${inspection.commonDir} does not match expected ${expectedCommonDir}`,
    );
  }
}

/**
 * Create a unique AEP worktree from an immutable base SHA.
 * Does not mutate files in the caller's original working tree.
 */
export function createManagedWorktree(input: CreateManagedWorktreeInput): ManagedWorktreeMetadata {
  const inspection = inspectRepository(input.repoPath);
  const baseSha = (input.baseSha ?? inspection.headSha)?.trim();
  if (baseSha === undefined || baseSha.length === 0) {
    throw new GitWorkspacesError(
      "missing_base_sha",
      "Cannot create worktree without a base commit SHA",
    );
  }

  const branchName = buildAepBranchName(input.taskId, input.runId);
  const dirName = buildWorktreeDirectoryName(input.taskId, input.runId);
  const worktreesRoot = resolve(input.worktreesRoot);
  const worktreePath = join(worktreesRoot, dirName);

  const store = input.metadata;
  if (store?.getByTaskRun(input.taskId, input.runId) !== undefined) {
    throw new GitWorkspacesError(
      "worktree_collision",
      `Managed worktree already exists for ${input.taskId}/${input.runId}`,
    );
  }

  mkdirSync(worktreesRoot, { recursive: true });

  // Collision / branch exists → actionable failure (no overwrite).
  const add = runGit(
    inspection.gitRoot,
    ["worktree", "add", "-b", branchName, worktreePath, baseSha],
    { allowFailure: true },
  );
  if (add.status !== 0) {
    const detail = add.stderr.trim() || add.stdout.trim() || "git worktree add failed";
    if (/already exists|already checked out|worktree add/i.test(detail)) {
      throw new GitWorkspacesError("worktree_collision", detail);
    }
    throw new GitWorkspacesError("git_command_failed", detail);
  }

  validateWorktreeBelongsToRepo(worktreePath, inspection.commonDir);

  const meta: ManagedWorktreeMetadata = {
    taskId: input.taskId,
    runId: input.runId,
    branchName,
    worktreePath,
    baseSha,
    gitRoot: inspection.gitRoot,
    commonDir: inspection.commonDir,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  store?.save(meta);
  return meta;
}

/**
 * Remove a managed worktree only with explicit confirm and a clean status check.
 * Dirty worktrees are retained by default.
 */
export function removeManagedWorktree(input: RemoveManagedWorktreeInput): void {
  if (input.confirm !== true) {
    throw new GitWorkspacesError("confirm_required", "Worktree cleanup requires confirm: true");
  }

  const main = inspectRepository(input.repoPath);
  validateWorktreeBelongsToRepo(input.worktreePath, main.commonDir);

  const worktree = inspectRepository(input.worktreePath);
  if (worktree.isDirty && input.allowDirty !== true) {
    throw new GitWorkspacesError(
      "dirty_worktree_retained",
      `Refusing to remove dirty worktree ${input.worktreePath}; pass allowDirty: true only with explicit operator intent`,
    );
  }

  const args =
    input.allowDirty === true
      ? (["worktree", "remove", "--force", input.worktreePath] as const)
      : (["worktree", "remove", input.worktreePath] as const);

  runGit(main.gitRoot, args);
  input.metadata?.remove(input.worktreePath);
}
