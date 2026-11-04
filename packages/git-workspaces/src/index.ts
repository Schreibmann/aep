export { buildAepBranchName, buildWorktreeDirectoryName } from "./branch-names.js";
export { GitWorkspacesError } from "./errors.js";
export { runGit } from "./git-exec.js";
export {
  inspectRepository,
  isWorkingTreeDirty,
  parentDirectory,
  resolveGitRoot,
} from "./inspect.js";
export type {
  PathPolicyInput,
  PathPolicyLimits,
  PathPolicyResult,
  PathPolicyViolation,
} from "./path-policy.js";
export { evaluatePathPolicy, normalizeWorktreeRelativePath } from "./path-policy.js";
export type {
  DirtyEntry,
  GitRemote,
  GitWorktreeInfo,
  PackageScript,
  RepositoryInspection,
  SubmoduleEntry,
  SymlinkEntry,
} from "./types.js";
export type { CreateManagedWorktreeInput, RemoveManagedWorktreeInput } from "./worktree-manager.js";
export {
  createManagedWorktree,
  removeManagedWorktree,
  validateWorktreeBelongsToRepo,
} from "./worktree-manager.js";
export type { ManagedWorktreeMetadata } from "./worktree-meta.js";
export { WorktreeMetadataStore } from "./worktree-meta.js";
