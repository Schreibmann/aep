import type { RoleId } from "@aep/domain";
import type { AgentToolPolicy } from "@aep/runtime-contracts";

export type RecordedAgentSession = {
  readonly agentId: string;
  readonly roleId: RoleId;
  readonly tools: AgentToolPolicy;
  readonly modelId: string;
  readonly cwd: string;
};

/**
 * In-process registry of opaque Cursor agent IDs → AEP role configuration.
 * Used to refuse unsafe cross-role resumes (Reviewer must never inherit Implementer).
 */
export class AgentSessionRegistry {
  private readonly byAgentId = new Map<string, RecordedAgentSession>();

  remember(session: RecordedAgentSession): void {
    this.byAgentId.set(session.agentId, session);
  }

  get(agentId: string): RecordedAgentSession | undefined {
    return this.byAgentId.get(agentId);
  }

  forget(agentId: string): void {
    this.byAgentId.delete(agentId);
  }
}

export type ResumeSafetyDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/**
 * Reviewer sessions MUST be independent. Never resume an Implementer (or other write-capable)
 * agentId under a reviewer role.
 */
export function evaluateResumeSafety(input: {
  readonly requestedRoleId: RoleId;
  readonly recorded: RecordedAgentSession | undefined;
  readonly forceFreshSession?: boolean;
}): ResumeSafetyDecision {
  if (input.forceFreshSession === true) {
    return {
      ok: false,
      reason: "force_fresh_session",
    };
  }
  if (input.recorded === undefined) {
    // Unknown prior role (e.g. process restart without registry). Allow resume attempt;
    // permissions are still reapplied from the caller's ExecutionSnapshot.
    return { ok: true };
  }
  if (input.requestedRoleId === input.recorded.roleId) {
    return { ok: true };
  }
  if (input.requestedRoleId === "reviewer" && input.recorded.roleId !== "reviewer") {
    return {
      ok: false,
      reason: `reviewer_must_not_inherit_${input.recorded.roleId}_session`,
    };
  }
  return {
    ok: false,
    reason: `role_mismatch:recorded_${input.recorded.roleId}_requested_${input.requestedRoleId}`,
  };
}
