import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createManagedWorktree,
  GitWorkspacesError,
  inspectRepository,
  removeManagedWorktree,
  runGit,
  WorktreeMetadataStore,
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

async function initRepo(): Promise<string> {
  const dir = await createTempDir("aep-wt-repo-");
  runGit(dir, ["init"]);
  runGit(dir, ["config", "user.email", "aep@example.com"]);
  runGit(dir, ["config", "user.name", "AEP Test"]);
  runGit(dir, ["config", "core.autocrlf", "false"]);
  await writeFile(join(dir, "README.md"), "# fixture\n", "utf8");
  runGit(dir, ["add", "."]);
  runGit(dir, ["commit", "-m", "init"]);
  return dir;
}

describe("AEP-031 worktree manager", () => {
  it("creates a worktree from base SHA without mutating the original tree", async () => {
    const repo = await initRepo();
    const worktreesRoot = await createTempDir("aep-wt-root-");
    const beforeStatus = runGit(repo, ["status", "--porcelain=v1"]).stdout;
    const beforeHead = runGit(repo, ["rev-parse", "HEAD"]).stdout.trim();
    const readmeBefore = await readFile(join(repo, "README.md"), "utf8");

    const meta = createManagedWorktree({
      repoPath: repo,
      taskId: "task-1",
      runId: "run-1",
      worktreesRoot,
      createdAt: "2026-11-05T00:00:00.000Z",
    });

    expect(meta.branchName).toBe("aep/task-1/run-1");
    expect(meta.baseSha).toBe(beforeHead);
    expect(resolve(meta.worktreePath).startsWith(resolve(worktreesRoot))).toBe(true);

    const wtReadme = await readFile(join(meta.worktreePath, "README.md"), "utf8");
    expect(wtReadme).toBe(readmeBefore);

    // Original working tree unchanged
    expect(runGit(repo, ["status", "--porcelain=v1"]).stdout).toBe(beforeStatus);
    expect(await readFile(join(repo, "README.md"), "utf8")).toBe(readmeBefore);
    expect(runGit(repo, ["rev-parse", "HEAD"]).stdout.trim()).toBe(beforeHead);

    // Write only inside worktree
    await writeFile(join(meta.worktreePath, "only-in-wt.txt"), "x\n", "utf8");
    expect(inspectRepository(repo).isDirty).toBe(false);
    expect(inspectRepository(meta.worktreePath).isDirty).toBe(true);
  });

  it("rejects parallel/duplicate creation collisions", async () => {
    const repo = await initRepo();
    const worktreesRoot = await createTempDir("aep-wt-coll-");
    const store = new WorktreeMetadataStore();

    createManagedWorktree({
      repoPath: repo,
      taskId: "task-x",
      runId: "run-x",
      worktreesRoot,
      metadata: store,
    });

    expect(() =>
      createManagedWorktree({
        repoPath: repo,
        taskId: "task-x",
        runId: "run-x",
        worktreesRoot,
        metadata: store,
      }),
    ).toThrow(GitWorkspacesError);

    // Distinct run ids can proceed in parallel naming space
    const second = createManagedWorktree({
      repoPath: repo,
      taskId: "task-x",
      runId: "run-y",
      worktreesRoot,
      metadata: store,
    });
    expect(second.branchName).toBe("aep/task-x/run-y");
    expect(store.list()).toHaveLength(2);
  });

  it("never automatically removes a dirty worktree", async () => {
    const repo = await initRepo();
    const worktreesRoot = await createTempDir("aep-wt-dirty-");
    const store = new WorktreeMetadataStore();
    const meta = createManagedWorktree({
      repoPath: repo,
      taskId: "task-d",
      runId: "run-d",
      worktreesRoot,
      metadata: store,
    });
    await writeFile(join(meta.worktreePath, "dirty.txt"), "nope\n", "utf8");

    expect(() =>
      removeManagedWorktree({
        repoPath: repo,
        worktreePath: meta.worktreePath,
        confirm: true,
        metadata: store,
      }),
    ).toThrowError(/dirty_worktree_retained|Refusing to remove dirty/);

    // Still present
    expect(inspectRepository(meta.worktreePath).isDirty).toBe(true);
    expect(store.getByPath(meta.worktreePath)).toBeDefined();
  });

  it("removes a clean worktree only with confirm", async () => {
    const repo = await initRepo();
    const worktreesRoot = await createTempDir("aep-wt-clean-");
    const store = new WorktreeMetadataStore();
    const meta = createManagedWorktree({
      repoPath: repo,
      taskId: "task-c",
      runId: "run-c",
      worktreesRoot,
      metadata: store,
    });

    removeManagedWorktree({
      repoPath: repo,
      worktreePath: meta.worktreePath,
      confirm: true,
      metadata: store,
    });

    expect(store.getByPath(meta.worktreePath)).toBeUndefined();
    expect(() => inspectRepository(meta.worktreePath)).toThrow(GitWorkspacesError);
  });
});
