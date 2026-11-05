import { createHash } from "node:crypto";
import type { AgentToolPolicy } from "@aep/runtime-contracts";
import { IMPLEMENTER_TOOLS } from "@aep/security";
import type { ReviewFinding } from "./review-schema.ts";

export const IMPLEMENTER_PROFILE_ID = "implementer" as const;
export const IMPLEMENTER_PROFILE_PROMPT_VERSION = "1";

export const IMPLEMENTER_SYSTEM_PROMPT = [
  "You are the AEP Implementer agent.",
  "Apply only the scoped corrections listed in the user prompt.",
  "Do not create or edit files outside the approved plan paths without human approval.",
  "Do not expand scope. Do not commit, push, merge, or deploy.",
  "Prefer minimal diffs that address the listed blocking findings.",
].join(" ");

export type ImplementerProfile = {
  readonly id: typeof IMPLEMENTER_PROFILE_ID;
  readonly goal: string;
  readonly tools: AgentToolPolicy;
  readonly systemPrompt: string;
  readonly promptVersion: string;
  readonly profileVersionHash: string;
};

function hashProfile(parts: ReadonlyArray<string>): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
    hash.update("\n");
  }
  return hash.digest("hex").slice(0, 16);
}

export function createImplementerProfile(): ImplementerProfile {
  const tools = IMPLEMENTER_TOOLS;
  const systemPrompt = IMPLEMENTER_SYSTEM_PROMPT;
  const promptVersion = IMPLEMENTER_PROFILE_PROMPT_VERSION;
  return {
    id: IMPLEMENTER_PROFILE_ID,
    goal: "Apply scoped corrections from review findings",
    tools,
    systemPrompt,
    promptVersion,
    profileVersionHash: hashProfile([
      IMPLEMENTER_PROFILE_ID,
      promptVersion,
      systemPrompt,
      tools.tools.join(","),
      tools.disallowedTools.join(","),
    ]),
  };
}

export type FixPromptInput = {
  readonly task: string;
  readonly approvedTouchedPaths: ReadonlyArray<string>;
  readonly findings: ReadonlyArray<ReviewFinding>;
  readonly previousFindingIds?: ReadonlyArray<string>;
};

/**
 * Map blocking findings into a scoped Implementer correction prompt.
 */
export function buildFixPromptFromFindings(input: FixPromptInput): string {
  const findingsBlock = input.findings
    .map((finding) => {
      const location =
        finding.file === undefined
          ? "location: (logic)"
          : `file: ${finding.file}${finding.line === undefined ? "" : `:${finding.line}`}`;
      return [
        `- id: ${finding.id}`,
        `  severity: ${finding.severity}`,
        `  title: ${finding.title}`,
        `  ${location}`,
        `  evidence: ${finding.evidence}`,
        finding.suggestedFix === undefined ? undefined : `  suggestedFix: ${finding.suggestedFix}`,
      ]
        .filter((line) => line !== undefined)
        .join("\n");
    })
    .join("\n");

  return [
    `Task:\n${input.task.trim()}`,
    `Approved paths (do not expand beyond these without approval):\n${input.approvedTouchedPaths.join("\n")}`,
    `Blocking findings to fix:\n${findingsBlock || "(none)"}`,
    input.previousFindingIds !== undefined && input.previousFindingIds.length > 0
      ? `Previously seen finding ids (avoid repeating the same unresolved defect):\n${input.previousFindingIds.join(", ")}`
      : undefined,
    "Implement the minimal scoped fix. Stay inside approved paths.",
  ]
    .filter((section) => section !== undefined)
    .join("\n\n");
}

export function detectRepeatedFindings(
  previousIds: ReadonlyArray<string>,
  currentIds: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const prev = new Set(previousIds);
  return currentIds.filter((id) => prev.has(id));
}
