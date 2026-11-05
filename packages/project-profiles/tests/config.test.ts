import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildProjectConfigFromDetection,
  detectStack,
  renderProjectConfigYaml,
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

describe("AEP-061 project config from detection", () => {
  it("auto-approves exact gates and leaves ambiguous pending", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aep-cfg-"));
    tempDirs.push(dir);
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "cfg",
        scripts: {
          lint: "eslint .",
          "check:all": "npm run lint && npm run test",
        },
      }),
      "utf8",
    );
    const detection = detectStack(dir);
    const config = buildProjectConfigFromDetection({
      detection,
      autoApproveExactGates: true,
      detectedAt: "2026-11-05T00:00:00.000Z",
    });
    expect(config.gates.approvedScriptNames).toContain("lint");
    expect(config.gates.pendingConfirmation).toContain("check:all");
    const yaml = renderProjectConfigYaml(config);
    expect(yaml).toContain("version: 1");
    expect(yaml).not.toMatch(/api[_-]?key/i);
  });
});
