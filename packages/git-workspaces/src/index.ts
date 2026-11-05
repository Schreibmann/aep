export { buildAepBranchName, buildWorktreeDirectoryName } from "./branch-names.ts";
export { GitWorkspacesError } from "./errors.ts";
export { runGit } from "./git-exec.ts";
export {
  inspectRepository,
  isWorkingTreeDirty,
  parentDirectory,
  resolveGitRoot,
} from "./inspect.ts";
export type {
  PathPolicyInput,
  PathPolicyLimits,
  PathPolicyResult,
  PathPolicyViolation,
} from "./path-policy.ts";
export { evaluatePathPolicy, normalizeWorktreeRelativePath } from "./path-policy.ts";
export type {
  DirtyEntry,
  GitRemote,
  GitWorktreeInfo,
  PackageScript,
  RepositoryInspection,
  SubmoduleEntry,
  SymlinkEntry,
} from "./types.ts";
export type { CreateManagedWorktreeInput, RemoveManagedWorktreeInput } from "./worktree-manager.ts";
export {
  createManagedWorktree,
  removeManagedWorktree,
  validateWorktreeBelongsToRepo,
} from "./worktree-manager.ts";
export type { ManagedWorktreeMetadata } from "./worktree-meta.ts";
export { WorktreeMetadataStore } from "./worktree-meta.ts";
