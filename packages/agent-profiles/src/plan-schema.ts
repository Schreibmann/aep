import { z } from "zod";

export const PLAN_SCHEMA_VERSION = "1";

/**
 * Structured Planner output (architecture §9.4 / AEP-050).
 * Paths and validation commands must be explicit — never inferred later from free text.
 */
export const plannerPlanSchema = z.object({
  objective: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  assumptions: z.array(z.string().trim().min(1)).default([]),
  touchedPaths: z.array(z.string().trim().min(1)).min(1),
  steps: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        description: z.string().trim().min(1),
        paths: z.array(z.string().trim().min(1)).default([]),
      }),
    )
    .min(1),
  risks: z.array(z.string().trim().min(1)).default([]),
  gates: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        /** Exact argv-style command identity for later gate runner; not free-form shell. */
        commandHint: z.string().trim().min(1),
        required: z.boolean().default(true),
      }),
    )
    .min(1),
  /** Explicit validation / test commands the Implementer and gates should cover. */
  validationCommands: z.array(z.string().trim().min(1)).min(1),
  estimate: z.object({
    complexity: z.enum(["low", "medium", "high"]),
    notes: z.string().trim().optional(),
  }),
  approvalFlags: z.object({
    requiresHumanApprovalBeforeWrite: z.boolean(),
    mayTouchSecretsOrAuth: z.boolean(),
    mayNeedNetwork: z.boolean(),
  }),
});

export type PlannerPlan = z.infer<typeof plannerPlanSchema>;

export type PlanParseSuccess = {
  readonly ok: true;
  readonly plan: PlannerPlan;
  readonly schemaVersion: typeof PLAN_SCHEMA_VERSION;
};

export type PlanParseFailure = {
  readonly ok: false;
  readonly issues: ReadonlyArray<string>;
};

export type PlanParseResult = PlanParseSuccess | PlanParseFailure;

function collectZodIssues(error: z.ZodError): ReadonlyArray<string> {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

/**
 * Extract a JSON object from model text (raw JSON or fenced ```json block).
 */
export function extractJsonObjectText(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1] !== undefined) {
    const inner = fenced[1].trim();
    if (inner.startsWith("{") && inner.endsWith("}")) {
      return inner;
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return undefined;
}

export function parsePlannerPlan(raw: string): PlanParseResult {
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
  const result = plannerPlanSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      issues: collectZodIssues(result.error),
    };
  }
  return {
    ok: true,
    plan: result.data,
    schemaVersion: PLAN_SCHEMA_VERSION,
  };
}
