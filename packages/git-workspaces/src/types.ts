export type DirtyEntry = {
  readonly path: string;
  readonly indexStatus: string;
  readonly workTreeStatus: string;
};

export type GitRemote = {
  readonly name: string;
  readonly fetchUrl?: string;
  readonly pushUrl?: string;
};

export type GitWorktreeInfo = {
  readonly path: string;
  readonly head?: string;
  readonly branch?: string;
  readonly bare: boolean;
  readonly detached: boolean;
};

export type SymlinkEntry = {
  readonly path: string;
  readonly target: string;
  readonly tracked: boolean;
};

export type SubmoduleEntry = {
  readonly path: string;
  readonly sha?: string;
  readonly statusPrefix: string;
};

export type PackageScript = {
  readonly name: string;
  readonly command: string;
};

export type RepositoryInspection = {
  readonly requestedPath: string;
  readonly gitRoot: string;
  readonly commonDir: string;
  readonly headSha: string | null;
  readonly branch: string | null;
  readonly isDetached: boolean;
  readonly isDirty: boolean;
  readonly dirtyEntries: ReadonlyArray<DirtyEntry>;
  readonly remotes: ReadonlyArray<GitRemote>;
  readonly worktrees: ReadonlyArray<GitWorktreeInfo>;
  readonly lockfiles: ReadonlyArray<string>;
  readonly projectFiles: ReadonlyArray<string>;
  readonly scripts: ReadonlyArray<PackageScript>;
  readonly symlinks: ReadonlyArray<SymlinkEntry>;
  readonly submodules: ReadonlyArray<SubmoduleEntry>;
};
