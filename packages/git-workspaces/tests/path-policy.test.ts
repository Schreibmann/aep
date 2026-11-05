import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createManagedWorktree,
  evaluatePathPolicy,
  GitWorkspacesError,
  normalizeWorktreeRelativePath,
  runGit,
} from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function initRepoWithWorktree(): Promise<{ repo: string; worktreePath: string }> {
  const repo = await createTempDir("aep-policy-repo-");
  runGit(repo, ["init"]);
  runGit(repo, ["config", "user.email", "aep@example.com"]);
  runGit(repo, ["config", "user.name", "AEP Test"]);
  runGit(repo, ["config", "core.autocrlf", "false"]);
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(join(repo, "src", "app.ts"), "export {}\n", "utf8");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-m", "init"]);
  const worktreesRoot = await createTempDir("aep-policy-wt-");
  const meta = createManagedWorktree({
    repoPath: repo,
    taskId: "task-p",
    runId: "run-p",
    worktreesRoot,
  });
  return { repo, worktreePath: meta.worktreePath };
}

describe("AEP-033 path policy", () => {
  it("rejects path traversal and normalizes Windows separators", () => {
    const root = process.cwd();
    expect(() => normalizeWorktreeRelativePath(root, "../outside.ts")).toThrow(GitWorkspacesError);
    expect(() => normalizeWorktreeRelativePath(root, "..\\outside.ts")).toThrow(GitWorkspacesError);
    const normalized = normalizeWorktreeRelativePath(root, "src\\feature\\a.ts");
    expect(normalized).toBe("src/feature/a.ts");
  });

  it("allows in-scope changes and blocks out-of-scope / vendor paths", async () => {
    const { worktreePath } = await initRepoWithWorktree();
    await writeFile(join(worktreePath, "src", "ok.ts"), "export const ok = 1\n", "utf8");
    await mkdir(join(worktreePath, "node_modules", "x"), { recursive: true });
    await writeFile(
      join(worktreePath, "node_modules", "x", "index.js"),
      "module.exports=1\n",
      "utf8",
    );
    await writeFile(join(worktreePath, "secret.env"), "K=V\n", "utf8");

    const result = evaluatePathPolicy({
      worktreePath,
      approvedPathPatterns: ["src/**"],
      limits: { maxChangedFiles: 50, maxDiffBytes: 1_000_000 },
    });

    expect(result.ok).toBe(false);
    expect(result.requiresHumanApproval).toBe(true);
    expect(result.changedPaths).toContain("src/ok.ts");
    expect(result.violations.some((v) => v.code === "blocked_path")).toBe(true);
    expect(result.violations.some((v) => v.code === "out_of_scope")).toBe(true);
  });

  it("detects symlink escapes outside the worktree", async () => {
    const { worktreePath } = await initRepoWithWorktree();
    const outside = await createTempDir("aep-policy-out-");
    const outsideFile = join(outside, "leak.txt");
    await writeFile(outsideFile, "secret\n", "utf8");
    const linkPath = join(worktreePath, "src", "escape-link");

    try {
      await symlink(outsideFile, linkPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes("privilege") || message.includes("EPERM")) {
        return;
      }
      throw error;
    }

    const result = evaluatePathPolicy({
      worktreePath,
      approvedPathPatterns: ["src/**"],
      limits: { maxChangedFiles: 50, maxDiffBytes: 1_000_000 },
    });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === "symlink_escape")).toBe(true);
  });

  it("enforces max file count and diff size", async () => {
    const { worktreePath } = await initRepoWithWorktree();
    await writeFile(join(worktreePath, "src", "a.ts"), `${"x".repeat(5000)}\n`, "utf8");
    await writeFile(join(worktreePath, "src", "b.ts"), `${"y".repeat(5000)}\n`, "utf8");

    const byCount = evaluatePathPolicy({
      worktreePath,
      approvedPathPatterns: ["src/**"],
      limits: { maxChangedFiles: 1, maxDiffBytes: 1_000_000 },
    });
    expect(byCount.violations.some((v) => v.code === "too_many_files")).toBe(true);

    const byBytes = evaluatePathPolicy({
      worktreePath,
      approvedPathPatterns: ["src/**"],
      limits: { maxChangedFiles: 50, maxDiffBytes: 100 },
    });
    expect(byBytes.violations.some((v) => v.code === "diff_too_large")).toBe(true);
  });
});
