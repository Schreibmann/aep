import { FakeAgentRuntime } from "@aep/runtime-contracts";
import { assertReviewerReadOnly, REVIEWER_TOOLS, SecurityError } from "@aep/security";
import { describe, expect, it } from "vitest";
import {
  blockingFindings,
  buildReviewRepairPrompt,
  createReviewerProfile,
  isBlockingFinding,
  parseReviewReport,
  parseReviewReportWithBoundedRetry,
  withReviewAssurance,
} from "../src/index.js";

const validReport = {
  verdict: "request_changes" as const,
  assurance: "same_model_fresh_session" as const,
  summary: "One blocking bug in the helper",
  findings: [
    {
      id: "f1",
      severity: "high" as const,
      category: "bug" as const,
      file: "src/helper.ts",
      line: 12,
      title: "Off-by-one",
      evidence: "loop uses <= length",
      confidence: "high" as const,
    },
  ],
};

describe("AEP-054 reviewer profile and report schema", () => {
  it("creates a read-only reviewer profile without write/shell tools", () => {
    const profile = createReviewerProfile();
    expect(profile.id).toBe("reviewer");
    expect(profile.tools).toEqual(REVIEWER_TOOLS);
    expect(profile.tools.tools).not.toContain("edit");
    expect(profile.tools.tools).not.toContain("shell");
    assertReviewerReadOnly(profile.tools);
    expect(() =>
      assertReviewerReadOnly({
        tools: ["read", "edit"],
        disallowedTools: [],
      }),
    ).toThrow(SecurityError);
  });

  it("accepts blocking findings with file/line evidence and rejects bare critical findings", () => {
    const ok = parseReviewReport(JSON.stringify(validReport));
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      const blockers = blockingFindings(ok.report.findings);
      expect(blockers).toHaveLength(1);
      const first = blockers[0];
      expect(first === undefined ? false : isBlockingFinding(first)).toBe(true);
    }

    const bad = parseReviewReport(
      JSON.stringify({
        ...validReport,
        findings: [
          {
            id: "f2",
            severity: "critical",
            category: "security",
            title: "Something bad",
            evidence: "looks wrong",
            confidence: "medium",
          },
        ],
      }),
    );
    expect(bad.ok).toBe(false);
  });

  it("accepts logic: evidence without file for high severity", () => {
    const ok = parseReviewReport(
      JSON.stringify({
        ...validReport,
        findings: [
          {
            id: "f3",
            severity: "high",
            category: "bug",
            title: "Race",
            evidence: "logic: double-checked locking without memory barrier",
            confidence: "medium",
          },
        ],
      }),
    );
    expect(ok.ok).toBe(true);
  });

  it("overwrites assurance from routing and retries malformed reports", async () => {
    const good = withReviewAssurance(
      {
        ...validReport,
        verdict: "approve",
        findings: [],
        summary: "Looks fine",
      },
      "different_model_fresh_session",
    );
    expect(good.assurance).toBe("different_model_fresh_session");

    const runtime = new FakeAgentRuntime({
      scripts: {
        exec_bad: {
          events: [
            {
              type: "started",
              executionId: "exec_bad",
              agentId: "reviewer_bad",
              runId: "run_bad",
            },
            { type: "completed", executionId: "exec_bad", resultText: "not-json" },
          ],
          result: {
            executionId: "exec_bad",
            status: "completed",
            resultText: "not-json",
          },
          usage: { status: "unknown", costStatus: "unknown", tokens: {} },
        },
        exec_good: {
          events: [
            {
              type: "started",
              executionId: "exec_good",
              agentId: "reviewer_good",
              runId: "run_good",
            },
            {
              type: "completed",
              executionId: "exec_good",
              resultText: JSON.stringify(validReport),
            },
          ],
          result: {
            executionId: "exec_good",
            status: "completed",
            resultText: JSON.stringify(validReport),
          },
          usage: { status: "unknown", costStatus: "unknown", tokens: {} },
        },
      },
    });

    const parsed = await parseReviewReportWithBoundedRetry({
      runtime,
      maxAttempts: 2,
      start: () =>
        runtime.startExecution({
          executionId: "exec_bad",
          roleId: "reviewer",
          prompt: "review",
          modelId: "fake-model",
          cwd: "/tmp",
          tools: REVIEWER_TOOLS,
          sandbox: { enabled: true },
        }),
      retry: async (issues) => {
        expect(buildReviewRepairPrompt("review", issues)).toContain("Validation issues");
        return runtime.startExecution({
          executionId: "exec_good",
          roleId: "reviewer",
          prompt: "repair",
          modelId: "fake-model",
          cwd: "/tmp",
          tools: REVIEWER_TOOLS,
          sandbox: { enabled: true },
        });
      },
    });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.attempts).toBe(2);
      expect(parsed.agentId).toBe("reviewer_good");
    }
  });
});
