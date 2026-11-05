import { describe, expect, it } from "vitest";
import { classifyRisk, evaluateRiskPolicy, pathMatchesAny } from "../src/index.js";

describe("AEP-051 risk and policy engine", () => {
  it("classifies auth/secret/payment/migration/CI/infra paths as high", () => {
    const cases: ReadonlyArray<{ path: string; rulePrefix: string }> = [
      { path: "src/auth/login.ts", rulePrefix: "path.auth" },
      { path: ".env.local", rulePrefix: "path.secrets" },
      { path: "apps/api/payment/charge.ts", rulePrefix: "path.payment" },
      { path: "packages/db/migrations/0001_init.sql", rulePrefix: "path.migrations" },
      { path: ".github/workflows/ci.yml", rulePrefix: "path.ci_cd" },
      { path: "infra/terraform/main.tf", rulePrefix: "path.infra" },
    ];
    for (const item of cases) {
      const classification = classifyRisk({
        taskDescription: "update module",
        touchedPaths: [item.path],
      });
      expect(classification.risk).toBe("high");
      expect(classification.uncertain).toBe(false);
      expect(classification.matched.some((m) => m.id.startsWith(item.rulePrefix))).toBe(true);
    }
  });

  it("never silently downgrades unknown risk to low", () => {
    const classification = classifyRisk({
      taskDescription: "Improve something in the app",
      touchedPaths: ["src/components/Widget.tsx"],
    });
    expect(classification.risk).toBe("medium");
    expect(classification.uncertain).toBe(true);
    expect(classification.risk).not.toBe("low");

    const policy = evaluateRiskPolicy(classification);
    expect(policy.verdict.decision).toBe("require_approval");
    expect(policy.requirements.requireReviewer).toBe(true);
    expect(policy.requirements.allowAgentWriteExecution).toBe(true);
  });

  it("classifies docs-only plans as low and still requires approval", () => {
    const classification = classifyRisk({
      taskDescription: "Fix typo in readme",
      touchedPaths: ["README.md", "docs/guide.md"],
    });
    expect(classification.risk).toBe("low");
    expect(classification.uncertain).toBe(false);

    const policy = evaluateRiskPolicy(classification);
    expect(policy.verdict.decision).toBe("require_approval");
    expect(policy.requirements.requireHumanApproval).toBe(true);
  });

  it("denies critical production operations and blocks write execution", () => {
    const classification = classifyRisk({
      taskDescription: "Delete production database and wipe production data",
      touchedPaths: ["scripts/cleanup.ts"],
    });
    expect(classification.risk).toBe("critical");

    const policy = evaluateRiskPolicy(classification);
    expect(policy.verdict.decision).toBe("deny");
    expect(policy.verdict.risk).toBe("critical");
    expect(policy.requirements.allowAgentWriteExecution).toBe(false);
  });

  it("honors plan secret/network flags as high", () => {
    const classification = classifyRisk({
      taskDescription: "Refactor helpers",
      touchedPaths: ["src/utils/helpers.ts"],
      mayTouchSecretsOrAuth: true,
      mayNeedNetwork: true,
    });
    expect(classification.risk).toBe("high");
    expect(classification.uncertain).toBe(false);
  });

  it("matches path globs case-insensitively", () => {
    expect(pathMatchesAny("Src/Auth/Login.TS", ["**/auth/**"])).toBe(true);
    expect(pathMatchesAny("README.md", ["**/*.md"])).toBe(true);
  });

  it("upgrades inconsistent uncertain+low before producing a verdict", () => {
    const policy = evaluateRiskPolicy({
      risk: "low",
      uncertain: true,
      matched: [],
    });
    expect(policy.classification.risk).toBe("medium");
    expect(policy.verdict.decision).toBe("require_approval");
  });
});
