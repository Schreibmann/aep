import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  type Stats,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { GitWorkspacesError } from "./errors.js";
import { runGit } from "./git-exec.js";
import type {
  DirtyEntry,
  GitRemote,
  GitWorktreeInfo,
  PackageScript,
  RepositoryInspection,
  SubmoduleEntry,
  SymlinkEntry,
} from "./types.js";

const LOCKFILE_NAMES = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "poetry.lock",
  "Pipfile.lock",
  "composer.lock",
  "Gemfile.lock",
] as const;

const PROJECT_FILE_NAMES = [
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "biome.json",
  "Cargo.toml",
  "pyproject.toml",
  "go.mod",
  "Gemfile",
  "composer.json",
  "AGENTS.md",
  "CLAUDE.md",
] as const;

function normalizePath(path: string): string {
  return resolve(path);
}

/**
 * Expand Windows 8.3 / junction forms so callers can compare paths stably.
 * Falls back to resolve() when the path does not exist yet.
 */
function canonicalizePath(path: string): string {
  const absolute = normalizePath(path);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

/**
 * spawnSync cwd must be a directory. If the caller passes a file path, use its parent.
 */
function resolveExistingDirectory(pathInput: string): string {
  const absolute = normalizePath(pathInput);
  try {
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) {
      return absolute;
    }
    return dirname(absolute);
  } catch {
    // Path may not exist yet; walk up to an existing directory.
    let current = absolute;
    while (current.length > 0 && !existsSync(current)) {
      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
    if (existsSync(current) && lstatSync(current).isDirectory()) {
      return current;
    }
    return dirname(absolute);
  }
}

function assertGitRepository(cwd: string): void {
  const probe = runGit(cwd, ["rev-parse", "--is-inside-work-tree"], { allowFailure: true });
  if (probe.status !== 0 || probe.stdout.trim() !== "true") {
    throw new GitWorkspacesError(
      "not_a_git_repository",
      `Path is not inside a Git work tree: ${cwd}. Initialize a repository or pass a Git project path.`,
    );
  }
}

function parsePorcelainStatus(stdout: string): ReadonlyArray<DirtyEntry> {
  const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0);
  const entries: DirtyEntry[] = [];
  for (const line of lines) {
    if (line.length < 4) {
      continue;
    }
    const indexStatus = line[0] ?? " ";
    const workTreeStatus = line[1] ?? " ";
    let pathPart = line.slice(3);
    // rename: "R  old -> new" — report the new path
    const renameSep = pathPart.indexOf(" -> ");
    if (renameSep >= 0) {
      pathPart = pathPart.slice(renameSep + 4);
    }
    entries.push({
      path: pathPart,
      indexStatus,
      workTreeStatus,
    });
  }
  return entries;
}

function parseRemotes(stdout: string): ReadonlyArray<GitRemote> {
  const byName = new Map<string, { fetchUrl?: string; pushUrl?: string }>();
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const parts = trimmed.split(/\s+/);
    const name = parts[0];
    const url = parts[1];
    const kind = parts[2];
    if (name === undefined || url === undefined) {
      continue;
    }
    const current = byName.get(name) ?? {};
    if (kind === "(push)") {
      byName.set(name, { ...current, pushUrl: url });
    } else {
      byName.set(name, { ...current, fetchUrl: url });
    }
  }
  return [...byName.entries()].map(([name, urls]) => ({
    name,
    ...(urls.fetchUrl === undefined ? {} : { fetchUrl: urls.fetchUrl }),
    ...(urls.pushUrl === undefined ? {} : { pushUrl: urls.pushUrl }),
  }));
}

function parseWorktreePorcelain(stdout: string): ReadonlyArray<GitWorktreeInfo> {
  const blocks = stdout.split(/\r?\n\r?\n/).filter((block) => block.trim().length > 0);
  const worktrees: GitWorktreeInfo[] = [];
  for (const block of blocks) {
    let path: string | undefined;
    let head: string | undefined;
    let branch: string | undefined;
    let bare = false;
    let detached = false;
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("worktree ")) {
        path = line.slice("worktree ".length);
      } else if (line.startsWith("HEAD ")) {
        head = line.slice("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        const ref = line.slice("branch ".length);
        branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
      } else if (line === "bare") {
        bare = true;
      } else if (line === "detached") {
        detached = true;
      }
    }
    if (path !== undefined) {
      worktrees.push({
        path,
        bare,
        detached,
        ...(head === undefined ? {} : { head }),
        ...(branch === undefined ? {} : { branch }),
      });
    }
  }
  return worktrees;
}

function parseSubmodules(stdout: string): ReadonlyArray<SubmoduleEntry> {
  const entries: SubmoduleEntry[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue;
    }
    // format: " <sha> <path> (...)" or "+<sha> ..." / "U<sha>" / "-<sha>"
    const match = /^([ U+-])([0-9a-f]{7,40})\s+(\S+)/.exec(line);
    if (match === null) {
      continue;
    }
    const statusPrefix = match[1] ?? " ";
    const sha = match[2];
    const path = match[3];
    if (path === undefined) {
      continue;
    }
    entries.push({
      path,
      statusPrefix,
      ...(sha === undefined ? {} : { sha }),
    });
  }
  return entries;
}

function listTrackedSymlinks(gitRoot: string): ReadonlyArray<SymlinkEntry> {
  const ls = runGit(gitRoot, ["ls-files", "-s"], { allowFailure: true });
  if (ls.status !== 0) {
    return [];
  }
  const entries: SymlinkEntry[] = [];
  for (const line of ls.stdout.split(/\r?\n/)) {
    // mode sha stage\tpath — symlink mode 120000
    const match = /^(120000)\s+[0-9a-f]+\s+\d+\t(.+)$/.exec(line);
    if (match === null) {
      continue;
    }
    const relPath = match[2];
    if (relPath === undefined) {
      continue;
    }
    const absolute = join(gitRoot, relPath);
    let target = "";
    try {
      target = readlinkSync(absolute);
    } catch {
      target = "(unreadable)";
    }
    entries.push({ path: relPath, target, tracked: true });
  }
  return entries;
}

function collectUntrackedSymlinks(
  gitRoot: string,
  dirtyEntries: ReadonlyArray<DirtyEntry>,
  tracked: ReadonlySet<string>,
): ReadonlyArray<SymlinkEntry> {
  const out: SymlinkEntry[] = [];
  for (const entry of dirtyEntries) {
    const untracked = entry.indexStatus === "?" && entry.workTreeStatus === "?";
    if (!untracked || tracked.has(entry.path)) {
      continue;
    }
    const absolute = join(gitRoot, entry.path);
    let stat: Stats;
    try {
      stat = lstatSync(absolute);
    } catch {
      continue;
    }
    if (!stat.isSymbolicLink()) {
      continue;
    }
    let target = "";
    try {
      target = readlinkSync(absolute);
    } catch {
      target = "(unreadable)";
    }
    out.push({ path: entry.path, target, tracked: false });
  }
  return out;
}

function collectNamedFiles(gitRoot: string, names: ReadonlyArray<string>): ReadonlyArray<string> {
  const found: string[] = [];
  for (const name of names) {
    const absolute = join(gitRoot, name);
    try {
      const stat = lstatSync(absolute);
      if (stat.isFile() || stat.isSymbolicLink()) {
        found.push(name);
      }
    } catch {
      // absent
    }
  }
  return found;
}

function readPackageScripts(gitRoot: string): ReadonlyArray<PackageScript> {
  const packageJsonPath = join(gitRoot, "package.json");
  let raw: string;
  try {
    raw = readFileSync(packageJsonPath, "utf8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null || !("scripts" in parsed)) {
    return [];
  }
  const scriptsValue = parsed.scripts;
  if (typeof scriptsValue !== "object" || scriptsValue === null) {
    return [];
  }
  const scripts: PackageScript[] = [];
  for (const [name, command] of Object.entries(scriptsValue)) {
    if (typeof command === "string") {
      scripts.push({ name, command });
    }
  }
  return scripts;
}

/**
 * Inspect a Git repository. Read-only: never mutates the working tree.
 */
export function inspectRepository(pathInput: string): RepositoryInspection {
  const requestedPath = normalizePath(pathInput);
  const startDir = resolveExistingDirectory(requestedPath);
  assertGitRepository(startDir);

  const gitRoot = canonicalizePath(
    runGit(startDir, ["rev-parse", "--show-toplevel"]).stdout.trim(),
  );
  const commonDirRaw = runGit(gitRoot, ["rev-parse", "--git-common-dir"]).stdout.trim();
  const commonDir = canonicalizePath(
    commonDirRaw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(commonDirRaw)
      ? commonDirRaw
      : join(gitRoot, commonDirRaw),
  );

  const headResult = runGit(gitRoot, ["rev-parse", "HEAD"], { allowFailure: true });
  const headSha = headResult.status === 0 ? headResult.stdout.trim() : null;

  const branchResult = runGit(gitRoot, ["branch", "--show-current"], { allowFailure: true });
  const branchName = branchResult.stdout.trim();
  const branch = branchName.length > 0 ? branchName : null;
  const isDetached = branch === null && headSha !== null;

  const statusOut = runGit(gitRoot, ["status", "--porcelain=v1", "-uall"]).stdout;
  const dirtyEntries = parsePorcelainStatus(statusOut);
  const isDirty = dirtyEntries.length > 0;

  const remotes = parseRemotes(runGit(gitRoot, ["remote", "-v"], { allowFailure: true }).stdout);
  const worktrees = parseWorktreePorcelain(
    runGit(gitRoot, ["worktree", "list", "--porcelain"], { allowFailure: true }).stdout,
  );
  const submodules = parseSubmodules(
    runGit(gitRoot, ["submodule", "status", "--recursive"], { allowFailure: true }).stdout,
  );

  const trackedSymlinks = listTrackedSymlinks(gitRoot);
  const trackedSet = new Set(trackedSymlinks.map((entry) => entry.path));
  const untrackedSymlinks = collectUntrackedSymlinks(gitRoot, dirtyEntries, trackedSet);
  const symlinks = [...trackedSymlinks, ...untrackedSymlinks];

  return {
    requestedPath,
    gitRoot,
    commonDir,
    headSha,
    branch,
    isDetached,
    isDirty,
    dirtyEntries,
    remotes,
    worktrees,
    lockfiles: collectNamedFiles(gitRoot, LOCKFILE_NAMES),
    projectFiles: collectNamedFiles(gitRoot, PROJECT_FILE_NAMES),
    scripts: readPackageScripts(gitRoot),
    symlinks,
    submodules,
  };
}

/**
 * Resolve the Git root for a path without a full inspection.
 */
export function resolveGitRoot(pathInput: string): string {
  const startDir = resolveExistingDirectory(pathInput);
  assertGitRepository(startDir);
  return canonicalizePath(runGit(startDir, ["rev-parse", "--show-toplevel"]).stdout.trim());
}

/**
 * True when the path is inside a dirty Git work tree (never mutates).
 */
export function isWorkingTreeDirty(pathInput: string): boolean {
  return inspectRepository(pathInput).isDirty;
}

/** Exported for tests that need parent-of-root helpers. */
export function parentDirectory(pathInput: string): string {
  return dirname(normalizePath(pathInput));
}
