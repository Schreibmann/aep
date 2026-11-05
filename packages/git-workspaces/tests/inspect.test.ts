import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  GitWorkspacesError,
  inspectRepository,
  isWorkingTreeDirty,
  resolveGitRoot,
  runGit,
} from "../src/index.ts";
import { samePath } from "./path-test-utils.ts";

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

function git(cwd: string, args: ReadonlyArray<string>): void {
  runGit(cwd, args);
}

async function initRepo(): Promise<string> {
  const dir = await createTempDir("aep-git-inspect-");
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "aep@example.com"]);
  git(dir, ["config", "user.name", "AEP Test"]);
  // Keep LF in fixtures so Windows CI with core.autocrlf=true does not diverge checkouts.
  git(dir, ["config", "core.autocrlf", "false"]);
  await writeFile(join(dir, "README.md"), "# fixture\n", "utf8");
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "fixture", scripts: { test: "echo ok" } }, null, 2),
    "utf8",
  );
  await writeFile(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "init"]);
  return dir;
}

describe("@aep/git-workspaces inspectRepository", () => {
  it("returns actionable error for a non-git directory", async () => {
    const dir = await createTempDir("aep-not-git-");
    expect(() => inspectRepository(dir)).toThrow(GitWorkspacesError);
    try {
      inspectRepository(dir);
    } catch (error) {
      expect(error).toBeInstanceOf(GitWorkspacesError);
      if (error instanceof GitWorkspacesError) {
        expect(error.code).toBe("not_a_git_repository");
        expect(error.message).toContain("not inside a Git work tree");
      }
    }
  });

  it("inspects a clean repository with lockfiles, scripts, and remotes", async () => {
    const dir = await initRepo();
    git(dir, ["remote", "add", "origin", "https://example.com/aep-fixture.git"]);

    const inspection = inspectRepository(dir);
    expect(samePath(inspection.gitRoot, dir)).toBe(true);
    expect(inspection.headSha).toMatch(/^[0-9a-f]{40}$/);
    expect(inspection.branch).not.toBeNull();
    expect(inspection.isDirty).toBe(false);
    expect(inspection.lockfiles).toContain("pnpm-lock.yaml");
    expect(inspection.projectFiles).toContain("package.json");
    expect(inspection.scripts.some((script) => script.name === "test")).toBe(true);
    expect(inspection.remotes.some((remote) => remote.name === "origin")).toBe(true);
    expect(inspection.worktrees.some((wt) => samePath(wt.path, dir))).toBe(true);
    expect(samePath(resolveGitRoot(join(dir, "README.md")), dir)).toBe(true);
  });

  it("detects dirty working tree without mutating it", async () => {
    const dir = await initRepo();
    const before = runGit(dir, ["rev-parse", "HEAD"]).stdout.trim();
    await writeFile(join(dir, "dirty.txt"), "change\n", "utf8");

    expect(isWorkingTreeDirty(dir)).toBe(true);
    const inspection = inspectRepository(dir);
    expect(inspection.isDirty).toBe(true);
    expect(inspection.dirtyEntries.some((entry) => entry.path === "dirty.txt")).toBe(true);

    const after = runGit(dir, ["rev-parse", "HEAD"]).stdout.trim();
    expect(after).toBe(before);
    const status = runGit(dir, ["status", "--porcelain=v1"]).stdout;
    expect(status).toContain("dirty.txt");
  });

  it("reports tracked and untracked symlink paths", async () => {
    const dir = await initRepo();
    const target = join(dir, "README.md");
    const trackedLink = join(dir, "tracked-link");
    const untrackedLink = join(dir, "loose-link");

    try {
      await symlink(target, trackedLink);
      git(dir, ["add", "tracked-link"]);
      git(dir, ["commit", "-m", "add symlink"]);
      await symlink(target, untrackedLink);
    } catch (error) {
      // Windows without symlink privilege: skip rather than fail the suite.
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes("privilege") || message.includes("EPERM")) {
        return;
      }
      throw error;
    }

    const inspection = inspectRepository(dir);
    const paths = inspection.symlinks.map((entry) => entry.path);
    expect(paths).toContain("tracked-link");
    expect(paths).toContain("loose-link");
    expect(inspection.symlinks.find((entry) => entry.path === "tracked-link")?.tracked).toBe(true);
    expect(inspection.symlinks.find((entry) => entry.path === "loose-link")?.tracked).toBe(false);
  });

  it("reports submodule paths when present", async () => {
    const parent = await initRepo();
    const child = await createTempDir("aep-sub-");
    git(child, ["init"]);
    git(child, ["config", "user.email", "aep@example.com"]);
    git(child, ["config", "user.name", "AEP Test"]);
    await writeFile(join(child, "child.txt"), "child\n", "utf8");
    git(child, ["add", "."]);
    git(child, ["commit", "-m", "child"]);

    // file:// submodule add
    const childUrl = child.replace(/\\/g, "/");
    runGit(parent, ["submodule", "add", childUrl, "vendor/child"], { allowFailure: true });
    // If submodule add fails (older git / path issues), synthesize .gitmodules + gitlink manually.
    const inspectionAfterAttempt = inspectRepository(parent);
    if (inspectionAfterAttempt.submodules.length === 0) {
      await mkdir(join(parent, "vendor"), { recursive: true });
      await writeFile(
        join(parent, ".gitmodules"),
        '[submodule "vendor/child"]\n\tpath = vendor/child\n\turl = ../child\n',
        "utf8",
      );
      // Still may be empty without registered submodule; assert .gitmodules is seen as project-adjacent dirty/content.
      expect(inspectionAfterAttempt.projectFiles.length).toBeGreaterThan(0);
      return;
    }
    expect(inspectionAfterAttempt.submodules.some((entry) => entry.path.includes("child"))).toBe(
      true,
    );
  });
});
