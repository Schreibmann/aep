import { lstatSync, readFileSync, realpathSync, type Stats } from "node:fs";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { GitWorkspacesError } from "./errors.js";
import { runGit } from "./git-exec.js";
import { inspectRepository } from "./inspect.js";

export type PathPolicyLimits = {
  readonly maxChangedFiles: number;
  readonly maxDiffBytes: number;
};

export type PathPolicyInput = {
  readonly worktreePath: string;
  /** Planner-approved path prefixes/globs relative to worktree (posix-ish, `*` supported). */
  readonly approvedPathPatterns: ReadonlyArray<string>;
  /** Extra blocked patterns (vendor/build). */
  readonly blockedPathPatterns?: ReadonlyArray<string>;
  readonly limits: PathPolicyLimits;
  /** Base ref for diff; defaults to HEAD (compares working tree + index against HEAD). */
  readonly baseRef?: string;
};

export type PathPolicyViolation =
  | { readonly code: "out_of_scope"; readonly path: string }
  | { readonly code: "blocked_path"; readonly path: string }
  | { readonly code: "symlink_escape"; readonly path: string; readonly realPath: string }
  | { readonly code: "path_traversal"; readonly path: string }
  | { readonly code: "too_many_files"; readonly count: number; readonly max: number }
  | { readonly code: "diff_too_large"; readonly bytes: number; readonly max: number };

export type PathPolicyResult = {
  readonly ok: boolean;
  readonly changedPaths: ReadonlyArray<string>;
  readonly diffBytes: number;
  readonly violations: ReadonlyArray<PathPolicyViolation>;
  readonly requiresHumanApproval: boolean;
};

const DEFAULT_BLOCKED = [
  "node_modules/**",
  "dist/**",
  "build/**",
  "coverage/**",
  ".git/**",
  "vendor/**",
] as const;

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function patternToRegExp(pattern: string): RegExp {
  const posix = pattern.replace(/\\/g, "/");
  const parts: string[] = [];
  for (let i = 0; i < posix.length; i += 1) {
    const ch = posix[i];
    if (ch === "*") {
      const next = posix[i + 1];
      if (next === "*") {
        parts.push(".*");
        i += 1;
      } else {
        parts.push("[^/]*");
      }
    } else if (ch === "?") {
      parts.push("[^/]");
    } else if (ch !== undefined && /[.+^${}()|[\]\\]/.test(ch)) {
      parts.push(`\\${ch}`);
    } else if (ch !== undefined) {
      parts.push(ch);
    }
  }
  return new RegExp(`^${parts.join("")}$`);
}

function matchesAny(path: string, patterns: ReadonlyArray<string>): boolean {
  const posix = toPosix(path);
  return patterns.some((pattern) => patternToRegExp(pattern).test(posix));
}

function assertInsideWorktree(worktreeRoot: string, candidateAbsolute: string): string {
  const rootReal = realpathSync(worktreeRoot);
  let candidateReal: string;
  try {
    candidateReal = realpathSync(candidateAbsolute);
  } catch {
    // Dangling symlink / deleted — still resolve parent realpath + normalize
    candidateReal = normalize(candidateAbsolute);
  }
  const rel = relative(rootReal, candidateReal);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new GitWorkspacesError(
      "symlink_escape",
      `Path escapes worktree: ${candidateAbsolute} -> ${candidateReal}`,
    );
  }
  return toPosix(rel);
}

/**
 * Normalize a worktree-relative path, reject `..` traversal and Windows drive escapes.
 */
export function normalizeWorktreeRelativePath(worktreeRoot: string, pathInput: string): string {
  const replaced = pathInput.replace(/\\/g, "/");
  if (replaced.includes("\0")) {
    throw new GitWorkspacesError("invalid_path", "path must not contain NUL");
  }
  if (isAbsolute(replaced) || /^[A-Za-z]:\//.test(replaced)) {
    throw new GitWorkspacesError("path_traversal", `Absolute paths are not allowed: ${pathInput}`);
  }
  const absolute = resolve(worktreeRoot, replaced);
  return assertInsideWorktree(worktreeRoot, absolute);
}

function listChangedPaths(worktreePath: string, baseRef: string): ReadonlyArray<string> {
  const tracked = runGit(worktreePath, ["diff", "--name-only", "--relative", baseRef], {
    allowFailure: true,
  });
  const staged = runGit(worktreePath, ["diff", "--name-only", "--relative", "--cached"], {
    allowFailure: true,
  });
  const untracked = runGit(worktreePath, ["ls-files", "--others", "--exclude-standard"], {
    allowFailure: true,
  });
  const set = new Set<string>();
  for (const blob of [tracked.stdout, staged.stdout, untracked.stdout]) {
    for (const line of blob.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        set.add(toPosix(trimmed));
      }
    }
  }
  return [...set].sort();
}

function measureDiffBytes(
  worktreePath: string,
  baseRef: string,
  changedPaths: ReadonlyArray<string>,
): number {
  const diff = runGit(worktreePath, ["diff", "--binary", baseRef], { allowFailure: true });
  const cached = runGit(worktreePath, ["diff", "--binary", "--cached"], { allowFailure: true });
  let total = Buffer.byteLength(diff.stdout, "utf8") + Buffer.byteLength(cached.stdout, "utf8");
  // Untracked files do not appear in `git diff`; count their on-disk size.
  for (const path of changedPaths) {
    const absolute = join(worktreePath, path);
    try {
      const tracked = runGit(worktreePath, ["ls-files", "--error-unmatch", path], {
        allowFailure: true,
      });
      if (tracked.status !== 0) {
        total += readFileSync(absolute).byteLength;
      }
    } catch {
      // ignore unreadable
    }
  }
  return total;
}

function checkSymlinkEscape(
  worktreeRoot: string,
  relativePath: string,
): PathPolicyViolation | undefined {
  const absolute = join(worktreeRoot, relativePath);
  let stat: Stats;
  try {
    stat = lstatSync(absolute);
  } catch {
    return undefined;
  }
  if (!stat.isSymbolicLink()) {
    // Still ensure the path stays inside after realpath for normal files/dirs
    try {
      assertInsideWorktree(worktreeRoot, absolute);
      return undefined;
    } catch (error) {
      if (error instanceof GitWorkspacesError && error.code === "symlink_escape") {
        return {
          code: "symlink_escape",
          path: relativePath,
          realPath: error.message,
        };
      }
      throw error;
    }
  }
  try {
    const real = realpathSync(absolute);
    assertInsideWorktree(worktreeRoot, real);
    return undefined;
  } catch (error) {
    const realPath = error instanceof GitWorkspacesError ? error.message : `escape:${relativePath}`;
    return { code: "symlink_escape", path: relativePath, realPath };
  }
}

/**
 * Evaluate changed paths in a managed worktree against planner scope and size limits.
 * Out-of-scope / escape / oversized changes require human approval (ok=false).
 */
export function evaluatePathPolicy(input: PathPolicyInput): PathPolicyResult {
  const worktree = inspectRepository(input.worktreePath);
  const worktreeRoot = worktree.gitRoot;
  const baseRef = input.baseRef ?? "HEAD";
  const blocked = [...DEFAULT_BLOCKED, ...(input.blockedPathPatterns ?? [])];
  const violations: PathPolicyViolation[] = [];

  const changedPaths: string[] = [];
  for (const raw of listChangedPaths(worktreeRoot, baseRef)) {
    try {
      const normalized = normalizeWorktreeRelativePath(worktreeRoot, raw);
      changedPaths.push(normalized);
    } catch (error) {
      if (error instanceof GitWorkspacesError && error.code === "path_traversal") {
        violations.push({ code: "path_traversal", path: raw });
        continue;
      }
      // Symlink targets resolved by realpath during normalize — record as policy
      // violation instead of crashing evaluatePathPolicy (Linux CI).
      if (error instanceof GitWorkspacesError && error.code === "symlink_escape") {
        const absolute = join(worktreeRoot, raw);
        let realPath = absolute;
        try {
          realPath = realpathSync(absolute);
        } catch {
          realPath = error.message;
        }
        violations.push({
          code: "symlink_escape",
          path: toPosix(raw),
          realPath,
        });
        continue;
      }
      throw error;
    }
  }

  for (const path of changedPaths) {
    const escapeViolation = checkSymlinkEscape(worktreeRoot, path);
    if (escapeViolation !== undefined) {
      violations.push(escapeViolation);
      continue;
    }
    if (matchesAny(path, blocked)) {
      violations.push({ code: "blocked_path", path });
      continue;
    }
    if (!matchesAny(path, input.approvedPathPatterns)) {
      violations.push({ code: "out_of_scope", path });
    }
  }

  if (changedPaths.length > input.limits.maxChangedFiles) {
    violations.push({
      code: "too_many_files",
      count: changedPaths.length,
      max: input.limits.maxChangedFiles,
    });
  }

  const diffBytes = measureDiffBytes(worktreeRoot, baseRef, changedPaths);
  if (diffBytes > input.limits.maxDiffBytes) {
    violations.push({
      code: "diff_too_large",
      bytes: diffBytes,
      max: input.limits.maxDiffBytes,
    });
  }

  const ok = violations.length === 0;
  return {
    ok,
    changedPaths,
    diffBytes,
    violations,
    requiresHumanApproval: !ok,
  };
}
