import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectStack } from "../src/index.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("AEP-060 stack detector", () => {
  it("detects pnpm + React/Vite/TS with confidence and evidence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aep-stack-"));
    tempDirs.push(dir);
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "demo",
        engines: { node: ">=22" },
        scripts: {
          lint: "eslint .",
          typecheck: "tsc -p tsconfig.json --noEmit",
          test: "vitest run",
          build: "vite build",
          "check:all": "npm run lint && npm run test",
        },
        dependencies: { react: "19.0.0" },
        devDependencies: { vite: "6.0.0", typescript: "5.0.0", vitest: "3.0.0" },
      }),
      "utf8",
    );
    await writeFile(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
    await writeFile(join(dir, "AGENTS.md"), "rules\n", "utf8");
    await mkdir(join(dir, ".cursor", "rules"), { recursive: true });
    await writeFile(join(dir, ".cursor", "rules", "x.mdc"), "rule\n", "utf8");

    const report = detectStack(dir);
    expect(report.packageManager.id).toBe("pnpm");
    expect(report.packageManager.confidence).toBe("high");
    expect(report.packageName).toBe("demo");
    expect(report.nodeEngines).toBe(">=22");
    expect(report.frameworks.some((f) => f.id === "react")).toBe(true);
    expect(report.frameworks.some((f) => f.id === "vite")).toBe(true);
    expect(report.scripts.find((s) => s.name === "lint")?.needsConfirmation).toBe(false);
    expect(report.ambiguousScripts.some((s) => s.name === "check:all")).toBe(true);
    expect(report.instructionFiles.some((f) => f.kind === "agents")).toBe(true);
    expect(report.instructionFiles.some((f) => f.kind === "cursor_rules")).toBe(true);
  });

  it("does not execute script bodies during detection", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aep-stack-unsafe-"));
    tempDirs.push(dir);
    const marker = join(dir, "pwned.txt");
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        scripts: {
          lint: `node -e "require('fs').writeFileSync(${JSON.stringify(marker)},'x')"`,
        },
      }),
      "utf8",
    );
    const report = detectStack(dir);
    expect(report.scripts[0]?.name).toBe("lint");
    await expect(import("node:fs/promises").then((fs) => fs.access(marker))).rejects.toBeTruthy();
  });

  it("marks monorepo when pnpm-workspace.yaml exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aep-stack-mono-"));
    tempDirs.push(dir);
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "root" }), "utf8");
    await writeFile(join(dir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n", "utf8");
    const report = detectStack(dir);
    expect(report.monorepo.detected).toBe(true);
    expect(report.monorepo.confidence).toBe("high");
  });
});
