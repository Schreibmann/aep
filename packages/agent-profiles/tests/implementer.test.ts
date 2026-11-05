import { describe, expect, it } from "vitest";
import {
  buildFixPromptFromFindings,
  createImplementerProfile,
  detectRepeatedFindings,
} from "../src/index.ts";

describe("AEP-055 implementer fix prompts", () => {
  it("builds a scoped fix prompt from blocking findings", () => {
    const profile = createImplementerProfile();
    expect(profile.id).toBe("implementer");
    expect(profile.tools.tools).toContain("edit");

    const prompt = buildFixPromptFromFindings({
      task: "Fix the race",
      approvedTouchedPaths: ["src/app.ts"],
      findings: [
        {
          id: "f1",
          severity: "high",
          category: "bug",
          file: "src/app.ts",
          line: 10,
          title: "Race",
          evidence: "shared mutable state",
          confidence: "high",
        },
      ],
    });
    expect(prompt).toContain("src/app.ts");
    expect(prompt).toContain("f1");
    expect(prompt).toContain("Approved paths");
  });

  it("detects repeated finding ids", () => {
    expect(detectRepeatedFindings(["f1", "f2"], ["f2", "f3"])).toEqual(["f2"]);
  });
});
