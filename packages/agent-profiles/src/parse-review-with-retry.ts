import type { AgentExecutionHandle, AgentRuntime } from "@aep/runtime-contracts";
import { parseReviewReport, type ReviewReport } from "./review-schema.js";

export type BoundedReviewParseInput = {
  readonly runtime: AgentRuntime;
  readonly start: () => Promise<AgentExecutionHandle>;
  readonly retry: (issues: ReadonlyArray<string>) => Promise<AgentExecutionHandle>;
  readonly maxAttempts?: number;
};

export type BoundedReviewParseResult =
  | {
      readonly ok: true;
      readonly report: ReviewReport;
      readonly attempts: number;
      readonly agentId: string;
      readonly executionId: string;
      readonly rawText: string;
    }
  | {
      readonly ok: false;
      readonly attempts: number;
      readonly agentId?: string;
      readonly executionId?: string;
      readonly lastIssues: ReadonlyArray<string>;
      readonly rawText?: string;
    };

const DEFAULT_MAX_ATTEMPTS = 2;

export async function parseReviewReportWithBoundedRetry(
  input: BoundedReviewParseInput,
): Promise<BoundedReviewParseResult> {
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("maxAttempts must be a positive integer");
  }

  let lastIssues: ReadonlyArray<string> = ["no attempt completed"];
  let lastRaw: string | undefined;
  let lastAgentId: string | undefined;
  let lastExecutionId: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const handle = attempt === 1 ? await input.start() : await input.retry(lastIssues);
    lastAgentId = handle.agentId;
    lastExecutionId = handle.executionId;
    const result = await handle.wait();
    if (result.status !== "completed") {
      lastIssues = [
        `execution ${result.status}${result.safeMessage === undefined ? "" : `: ${result.safeMessage}`}`,
      ];
      continue;
    }
    const rawText = result.resultText ?? "";
    lastRaw = rawText;
    const parsed = parseReviewReport(rawText);
    if (parsed.ok) {
      return {
        ok: true,
        report: parsed.report,
        attempts: attempt,
        agentId: handle.agentId,
        executionId: handle.executionId,
        rawText,
      };
    }
    lastIssues = parsed.issues;
  }

  return {
    ok: false,
    attempts: maxAttempts,
    ...(lastAgentId === undefined ? {} : { agentId: lastAgentId }),
    ...(lastExecutionId === undefined ? {} : { executionId: lastExecutionId }),
    lastIssues,
    ...(lastRaw === undefined ? {} : { rawText: lastRaw }),
  };
}
