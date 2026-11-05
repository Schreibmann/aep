import type { RoleId } from "@aep/domain";
import type { AgentToolPolicy } from "@aep/runtime-contracts";
import { SecurityError } from "./errors.ts";

/**
 * Role tool allowlists (architecture §7.5 / AEP-034).
 * Names must stay aligned with the pinned Cursor SDK ToolName set.
 */
export const REVIEWER_TOOLS: AgentToolPolicy = {
  tools: ["read", "grep", "glob", "ls"],
  disallowedTools: ["shell", "edit", "mcp", "task"],
};

export const PLANNER_TOOLS: AgentToolPolicy = {
  tools: ["read", "grep", "glob", "ls"],
  disallowedTools: ["shell", "edit", "mcp", "task"],
};

export const IMPLEMENTER_TOOLS: AgentToolPolicy = {
  tools: ["read", "edit", "shell"],
  disallowedTools: ["mcp", "task"],
};

export function toolPolicyForRole(roleId: RoleId): AgentToolPolicy {
  switch (roleId) {
    case "planner":
      return PLANNER_TOOLS;
    case "implementer":
      return IMPLEMENTER_TOOLS;
    case "reviewer":
      return REVIEWER_TOOLS;
    default: {
      const _exhaustive: never = roleId;
      throw new SecurityError("unknown_role", `Unknown role: ${String(_exhaustive)}`);
    }
  }
}

export function assertReviewerReadOnly(policy: AgentToolPolicy): void {
  const forbidden = policy.tools.filter(
    (tool) => tool === "shell" || tool === "edit" || tool === "mcp" || tool === "task",
  );
  if (forbidden.length > 0) {
    throw new SecurityError(
      "reviewer_write_tools",
      `Reviewer must not receive write/shell tools: ${forbidden.join(", ")}`,
    );
  }
}

export function assertPlannerReadOnly(policy: AgentToolPolicy): void {
  const forbidden = policy.tools.filter(
    (tool) => tool === "shell" || tool === "edit" || tool === "mcp" || tool === "task",
  );
  if (forbidden.length > 0) {
    throw new SecurityError(
      "planner_write_tools",
      `Planner must not receive write/shell tools: ${forbidden.join(", ")}`,
    );
  }
  for (const name of ["shell", "edit"] as const) {
    if (!policy.disallowedTools.includes(name)) {
      throw new SecurityError("planner_write_tools", `Planner must disallow ${name}`);
    }
  }
}
