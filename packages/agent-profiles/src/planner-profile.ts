import { createHash } from "node:crypto";
import type { AgentToolPolicy } from "@aep/runtime-contracts";
import { PLANNER_TOOLS } from "@aep/security";
import { PLAN_SCHEMA_VERSION } from "./plan-schema.js";

export const PLANNER_PROFILE_ID = "planner" as const;

export const PLANNER_PROFILE_PROMPT_VERSION = "1";

/**
 * Stable system prompt for the Planner role. Read-only; structured JSON only.
 */
export const PLANNER_SYSTEM_PROMPT = [
  "You are the AEP Planner agent.",
  "Explore the repository with read-only tools only (read, grep, glob, ls).",
  "You MUST NOT edit files, run shell commands, use MCP, or spawn nested tasks.",
  "Return a single JSON object matching the AEP planner plan schema.",
  "Do not wrap the JSON in commentary outside a optional ```json fence.",
  "Required fields: objective, summary, assumptions, touchedPaths, steps,",
  "risks, gates, validationCommands, estimate, approvalFlags.",
  "touchedPaths and validationCommands must be explicit non-empty arrays.",
  "gates[].commandHint must name a concrete project check (e.g. pnpm lint).",
  "Set approvalFlags.requiresHumanApprovalBeforeWrite to true for any write work.",
].join(" ");

export type AgentProfile = {
  readonly id: typeof PLANNER_PROFILE_ID;
  readonly goal: string;
  readonly tools: AgentToolPolicy;
  readonly systemPrompt: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly profileVersionHash: string;
  readonly outputFormat: "json_plan";
};

function hashProfile(parts: ReadonlyArray<string>): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
    hash.update("\n");
  }
  return hash.digest("hex").slice(0, 16);
}

export function createPlannerProfile(): AgentProfile {
  const tools = PLANNER_TOOLS;
  const systemPrompt = PLANNER_SYSTEM_PROMPT;
  const promptVersion = PLANNER_PROFILE_PROMPT_VERSION;
  const schemaVersion = PLAN_SCHEMA_VERSION;
  return {
    id: PLANNER_PROFILE_ID,
    goal: "Investigate the task and propose an explicit implementation plan",
    tools,
    systemPrompt,
    promptVersion,
    schemaVersion,
    profileVersionHash: hashProfile([
      PLANNER_PROFILE_ID,
      promptVersion,
      schemaVersion,
      systemPrompt,
      tools.tools.join(","),
      tools.disallowedTools.join(","),
    ]),
    outputFormat: "json_plan",
  };
}

export type PlannerPromptInput = {
  readonly task: string;
  readonly projectContext: string;
};

export function buildPlannerUserPrompt(input: PlannerPromptInput): string {
  const task = input.task.trim();
  const context = input.projectContext.trim();
  const sections = [
    `Task:\n${task}`,
    context.length > 0
      ? `Project context (truncated; not the full repository):\n${context}`
      : undefined,
    "Respond with the plan JSON object only.",
  ];
  return sections.filter((section) => section !== undefined).join("\n\n");
}
