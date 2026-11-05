import { createHash } from "node:crypto";
import type { AgentToolPolicy } from "@aep/runtime-contracts";
import { REVIEWER_TOOLS } from "@aep/security";
import { REVIEW_SCHEMA_VERSION } from "./review-schema.ts";

export const REVIEWER_PROFILE_ID = "reviewer" as const;

export const REVIEWER_PROFILE_PROMPT_VERSION = "1";

export const REVIEWER_SYSTEM_PROMPT = [
  "You are the AEP Reviewer agent.",
  "You receive requirements, an approved plan, diff/changed files, gate evidence, and architecture rules.",
  "Use read-only tools only (read, grep, glob, ls).",
  "You MUST NOT edit files, run shell, use MCP, or spawn nested tasks.",
  "You MUST NOT treat this session as a different AI provider; it is a fresh Cursor session.",
  "Return a single JSON ReviewReport object only.",
  "Required fields: verdict, assurance, findings, summary.",
  "Every finding MUST include non-empty evidence.",
  "critical/high findings that should block MUST include file and/or line, or evidence starting with logic:.",
  "Do not invent gate results; use the provided gate evidence.",
].join(" ");

export type ReviewerProfile = {
  readonly id: typeof REVIEWER_PROFILE_ID;
  readonly goal: string;
  readonly tools: AgentToolPolicy;
  readonly systemPrompt: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly profileVersionHash: string;
  readonly outputFormat: "json_review";
};

function hashProfile(parts: ReadonlyArray<string>): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
    hash.update("\n");
  }
  return hash.digest("hex").slice(0, 16);
}

export function createReviewerProfile(): ReviewerProfile {
  const tools = REVIEWER_TOOLS;
  const systemPrompt = REVIEWER_SYSTEM_PROMPT;
  const promptVersion = REVIEWER_PROFILE_PROMPT_VERSION;
  const schemaVersion = REVIEW_SCHEMA_VERSION;
  return {
    id: REVIEWER_PROFILE_ID,
    goal: "Review the approved plan, diff, and gate evidence for defects",
    tools,
    systemPrompt,
    promptVersion,
    schemaVersion,
    profileVersionHash: hashProfile([
      REVIEWER_PROFILE_ID,
      promptVersion,
      schemaVersion,
      systemPrompt,
      tools.tools.join(","),
      tools.disallowedTools.join(","),
    ]),
    outputFormat: "json_review",
  };
}

export type ReviewerPromptInput = {
  readonly task: string;
  readonly approvedPlanJson: string;
  readonly changedFiles: ReadonlyArray<string>;
  readonly diffSummary: string;
  readonly gateEvidenceJson: string;
  readonly architectureRules: string;
};

export function buildReviewerUserPrompt(input: ReviewerPromptInput): string {
  return [
    `Task:\n${input.task.trim()}`,
    `Approved plan JSON:\n${input.approvedPlanJson.trim()}`,
    `Changed files:\n${input.changedFiles.length === 0 ? "(none)" : input.changedFiles.join("\n")}`,
    `Diff summary (truncated):\n${input.diffSummary.trim() || "(none)"}`,
    `Gate evidence JSON:\n${input.gateEvidenceJson.trim() || "[]"}`,
    `Architecture rules (truncated):\n${input.architectureRules.trim() || "(none)"}`,
    "Respond with the ReviewReport JSON object only.",
  ].join("\n\n");
}

export function buildReviewRepairPrompt(task: string, issues: ReadonlyArray<string>): string {
  return [
    "Your previous ReviewReport JSON was invalid.",
    "Fix every issue and return a complete valid ReviewReport JSON object only.",
    `Original task:\n${task.trim()}`,
    `Validation issues:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
  ].join("\n\n");
}
