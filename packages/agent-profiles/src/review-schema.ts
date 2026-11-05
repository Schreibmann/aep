import { z } from "zod";
import { extractJsonObjectText } from "./plan-schema.js";

export const REVIEW_SCHEMA_VERSION = "1";

export const reviewFindingSchema = z.object({
  id: z.string().trim().min(1),
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  category: z.enum([
    "bug",
    "security",
    "regression",
    "architecture",
    "performance",
    "test_gap",
    "scope",
  ]),
  file: z.string().trim().min(1).optional(),
  line: z.number().int().positive().optional(),
  title: z.string().trim().min(1),
  evidence: z.string().trim().min(1),
  suggestedFix: z.string().trim().min(1).optional(),
  confidence: z.enum(["high", "medium", "low"]),
});

export const reviewReportSchema = z.object({
  verdict: z.enum(["approve", "request_changes", "needs_human_review"]),
  /**
   * Model may propose assurance; AEP overwrites with the routing-derived value before persist.
   */
  assurance: z.enum([
    "different_model_fresh_session",
    "same_model_fresh_session",
    "review_unavailable",
  ]),
  findings: z.array(reviewFindingSchema),
  summary: z.string().trim().min(1),
});

export type ReviewFinding = z.infer<typeof reviewFindingSchema>;
export type ReviewReport = z.infer<typeof reviewReportSchema>;

export type ReviewParseSuccess = {
  readonly ok: true;
  readonly report: ReviewReport;
  readonly schemaVersion: typeof REVIEW_SCHEMA_VERSION;
};

export type ReviewParseFailure = {
  readonly ok: false;
  readonly issues: ReadonlyArray<string>;
};

export type ReviewParseResult = ReviewParseSuccess | ReviewParseFailure;

function collectZodIssues(error: z.ZodError): ReadonlyArray<string> {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

/**
 * Blocking findings (critical/high) require evidence plus file/line or an explicit logic marker.
 */
export function isBlockingFinding(finding: ReviewFinding): boolean {
  if (finding.severity !== "critical" && finding.severity !== "high") {
    return false;
  }
  const hasLocation = finding.file !== undefined || finding.line !== undefined;
  const hasLogicEvidence = /^logic:/i.test(finding.evidence.trim());
  return finding.evidence.trim().length > 0 && (hasLocation || hasLogicEvidence);
}

export function advisoryFindings(
  findings: ReadonlyArray<ReviewFinding>,
): ReadonlyArray<ReviewFinding> {
  return findings.filter((finding) => !isBlockingFinding(finding));
}

export function blockingFindings(
  findings: ReadonlyArray<ReviewFinding>,
): ReadonlyArray<ReviewFinding> {
  return findings.filter((finding) => isBlockingFinding(finding));
}

function validateBlockingEvidence(report: ReviewReport): ReadonlyArray<string> {
  const issues: string[] = [];
  for (const finding of report.findings) {
    if (finding.severity !== "critical" && finding.severity !== "high") {
      continue;
    }
    if (isBlockingFinding(finding)) {
      continue;
    }
    issues.push(
      `findings.${finding.id}: critical/high finding needs evidence with file/line or logic: prefix to be blocking; otherwise lower severity or add location`,
    );
  }
  if (
    report.verdict === "request_changes" &&
    blockingFindings(report.findings).length === 0 &&
    report.findings.some((f) => f.severity === "critical" || f.severity === "high")
  ) {
    issues.push(
      "verdict: request_changes with critical/high findings that lack location/logic evidence is invalid",
    );
  }
  return issues;
}

export function parseReviewReport(raw: string): ReviewParseResult {
  const jsonText = extractJsonObjectText(raw);
  if (jsonText === undefined) {
    return {
      ok: false,
      issues: ["response does not contain a JSON object"],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      ok: false,
      issues: ["response JSON is malformed"],
    };
  }
  const result = reviewReportSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      issues: collectZodIssues(result.error),
    };
  }
  const blockingIssues = validateBlockingEvidence(result.data);
  if (blockingIssues.length > 0) {
    return {
      ok: false,
      issues: blockingIssues,
    };
  }
  return {
    ok: true,
    report: result.data,
    schemaVersion: REVIEW_SCHEMA_VERSION,
  };
}

export function withReviewAssurance(
  report: ReviewReport,
  assurance: ReviewReport["assurance"],
): ReviewReport {
  return {
    ...report,
    assurance,
  };
}
