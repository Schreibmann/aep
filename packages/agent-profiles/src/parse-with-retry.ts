import type { AgentExecutionHandle, AgentRuntime } from "@aep/runtime-contracts";
import { type PlannerPlan, parsePlannerPlan } from "./plan-schema.ts";

export type BoundedPlanParseInput = {
  readonly runtime: AgentRuntime;
  readonly start: () => Promise<AgentExecutionHandle>;
  readonly retry: (issues: ReadonlyArray<string>) => Promise<AgentExecutionHandle>;
  readonly maxAttempts?: number;
};

export type BoundedPlanParseResult =
  | {
      readonly ok: true;
      readonly plan: PlannerPlan;
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

/**
 * Run Planner execution(s) until a valid plan is parsed or attempts are exhausted.
 */
export async function parsePlannerPlanWithBoundedRetry(
  input: BoundedPlanParseInput,
): Promise<BoundedPlanParseResult> {
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
    const parsed = parsePlannerPlan(rawText);
    if (parsed.ok) {
      return {
        ok: true,
        plan: parsed.plan,
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

export function buildPlanRepairPrompt(task: string, issues: ReadonlyArray<string>): string {
  return [
    "Your previous plan JSON was invalid.",
    "Fix every issue and return a complete valid plan JSON object only.",
    `Original task:\n${task.trim()}`,
    `Validation issues:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
  ].join("\n\n");
}
