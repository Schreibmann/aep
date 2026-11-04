export { GitWorkspacesError } from "./errors.js";
export { runGit } from "./git-exec.js";
export {
  inspectRepository,
  isWorkingTreeDirty,
  parentDirectory,
  resolveGitRoot,
} from "./inspect.js";
export type {
  DirtyEntry,
  GitRemote,
  GitWorktreeInfo,
  PackageScript,
  RepositoryInspection,
  SubmoduleEntry,
  SymlinkEntry,
} from "./types.js";
