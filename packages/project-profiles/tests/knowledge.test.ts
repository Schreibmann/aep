import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assembleKnowledgeContext,
  buildKnowledgePacks,
  isExcludedKnowledgePath,
  listKnowledgePacks,
  updateKnowledgePack,
} from "../src/index.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("AEP-063 knowledge packs", () => {
  it("excludes secrets and generated paths", () => {
    expect(isExcludedKnowledgePath(".env")).toBe(true);
    expect(isExcludedKnowledgePath(".env.local")).toBe(true);
    expect(isExcludedKnowledgePath("secrets/api.txt")).toBe(true);
    expect(isExcludedKnowledgePath("node_modules/pkg/README.md")).toBe(true);
    expect(isExcludedKnowledgePath("dist/index.js")).toBe(true);
    expect(isExcludedKnowledgePath("AGENTS.md")).toBe(false);
    expect(isExcludedKnowledgePath("docs/architecture.md")).toBe(false);
  });

  it("builds packs from real sources with hashes and preserves edits", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aep-know-"));
    tempDirs.push(dir);
    await writeFile(
      join(dir, "AGENTS.md"),
      "# Agents\nUse worktrees. Never commit secrets.\n",
      "utf8",
    );
    await mkdir(join(dir, "docs"), { recursive: true });
    await writeFile(
      join(dir, "docs", "architecture.md"),
      "# Architecture\nDeterministic orchestrator owns workflow state.\n",
      "utf8",
    );
    await writeFile(join(dir, ".env"), "API_KEY=sk-secret-should-never-pack\n", "utf8");

    const built = buildKnowledgePacks({
      projectRoot: dir,
      now: () => "2026-11-05T00:00:00.000Z",
    });
    expect(built.created.map((pack) => pack.id).sort()).toEqual(["agents", "docs-architecture"]);
    expect(built.skippedExcluded).not.toContain(".env");
    const agents = built.created.find((pack) => pack.id === "agents");
    expect(agents?.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(agents?.sourcePath).toBe("AGENTS.md");
    expect(agents?.reviewed).toBe(false);

    const edited = updateKnowledgePack({
      projectRoot: dir,
      packId: "agents",
      content: "Maintainer-approved conventions only.",
      title: "Reviewed agent conventions",
      now: () => "2026-11-05T01:00:00.000Z",
    });
    expect(edited.reviewed).toBe(true);
    expect(edited.content).toContain("Maintainer-approved");

    const again = buildKnowledgePacks({ projectRoot: dir });
    expect(again.skippedExisting).toContain("agents");
    const listed = listKnowledgePacks(dir);
    const still = listed.find((pack) => pack.id === "agents");
    expect(still?.content).toContain("Maintainer-approved");

    const raw = await readFile(join(dir, ".aep", "knowledge", "agents.json"), "utf8");
    expect(raw).not.toMatch(/sk-secret/);
  });

  it("assembles context by relevance within a token budget", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aep-know-asm-"));
    tempDirs.push(dir);
    await writeFile(join(dir, "AGENTS.md"), "Conventions about worktrees and sandbox.\n", "utf8");
    await mkdir(join(dir, "docs"), { recursive: true });
    await writeFile(
      join(dir, "docs", "architecture.md"),
      `${"Architecture orchestrator workflow ".repeat(200)}\n`,
      "utf8",
    );
    await writeFile(join(dir, "docs", "api.md"), "API patterns for REST handlers.\n", "utf8");
    buildKnowledgePacks({ projectRoot: dir });

    const assembled = assembleKnowledgeContext({
      projectRoot: dir,
      query: "architecture orchestrator",
      tokenBudget: 200,
      preferCategories: ["architecture"],
    });
    expect(assembled.chunks.length).toBeGreaterThan(0);
    expect(assembled.totalEstimatedTokens).toBeLessThanOrEqual(200);
    expect(assembled.chunks[0]?.category).toBe("architecture");
    expect(assembled.omittedPackIds.length).toBeGreaterThan(0);
  });
});
