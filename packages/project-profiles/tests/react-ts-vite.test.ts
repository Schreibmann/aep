import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildProjectConfigFromDetection,
  detectStack,
  renderProjectConfigYaml,
  resolveReactTsViteProfile,
  selectReviewerChecklist,
  tryLoadAepProjectConfig,
} from "../src/index.js";

const tempDirs: string[] = [];
const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("AEP-062 react-ts-vite profile", () => {
  it("resolves vite react ts fixture with pm, gates, and checklist", () => {
    const root = join(fixturesRoot, "vite-react-ts");
    const profile = resolveReactTsViteProfile(root);
    expect(profile.id).toBe("react-ts-vite");
    expect(profile.packageManagerCommandId).toBe("pnpm");
    expect(profile.capabilities.hasReact).toBe(true);
    expect(profile.capabilities.hasVite).toBe(true);
    expect(profile.capabilities.hasTypescript).toBe(true);
    expect(profile.capabilities.hasVitest).toBe(true);
    expect(profile.capabilities.isMonorepo).toBe(false);
    expect(profile.approvedScriptNames).toEqual(
      expect.arrayContaining(["lint", "typecheck", "test", "build"]),
    );
    expect(profile.approvedScriptNames).not.toContain("check:all");
    expect(profile.checklist.some((item) => item.category === "hooks")).toBe(true);
    expect(profile.checklistText).toContain("Rules of Hooks");
  });

  it("resolves monorepo fixture without inventing a test framework", () => {
    const root = join(fixturesRoot, "monorepo");
    const profile = resolveReactTsViteProfile(root);
    expect(profile.capabilities.isMonorepo).toBe(true);
    expect(profile.packageManagerCommandId).toBe("pnpm");
    expect(profile.capabilities.hasReact).toBe(false);
    expect(profile.capabilities.hasVitest).toBe(false);
    expect(profile.checklist.every((item) => !item.requiresFrameworks.includes("react"))).toBe(
      true,
    );
    expect(profile.approvedScriptNames).toEqual(
      expect.arrayContaining(["lint", "typecheck", "test", "build"]),
    );
  });

  it("only keeps approved scripts when config is present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aep-profile-"));
    tempDirs.push(dir);
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "gated",
        scripts: {
          lint: "eslint .",
          typecheck: "tsc -p tsconfig.json --noEmit",
          test: "vitest run",
          build: "vite build",
          "check:all": "npm run lint && npm run test",
        },
        dependencies: { react: "19.0.0" },
        devDependencies: { typescript: "5.8.0", vite: "6.0.0", vitest: "3.0.0" },
      }),
      "utf8",
    );
    await writeFile(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
    const detection = detectStack(dir);
    const config = buildProjectConfigFromDetection({
      detection,
      approvedGateScripts: ["lint", "typecheck"],
      autoApproveExactGates: false,
      detectedAt: "2026-11-05T00:00:00.000Z",
    });
    await mkdir(join(dir, ".aep"), { recursive: true });
    await writeFile(join(dir, ".aep", "config.yaml"), renderProjectConfigYaml(config), "utf8");

    const loaded = tryLoadAepProjectConfig(dir);
    expect(loaded?.gates.approvedScriptNames).toEqual(["lint", "typecheck"]);
    expect(loaded?.gates.pendingConfirmation).toContain("check:all");

    const profile = resolveReactTsViteProfile({ projectRoot: dir, requireConfig: true });
    expect(profile.approvedScriptNames).toEqual(["lint", "typecheck"]);
    expect(profile.approvedScriptNames).not.toContain("test");
    expect(profile.approvedScriptNames).not.toContain("check:all");
  });

  it("omits react checklist items when react is absent", () => {
    const items = selectReviewerChecklist({ frameworkIds: ["typescript", "vite"] });
    expect(items.some((item) => item.category === "hooks")).toBe(false);
    expect(items.some((item) => item.category === "typescript")).toBe(true);
    expect(items.some((item) => item.category === "build")).toBe(true);
  });
});
