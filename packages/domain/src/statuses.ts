export type WorkflowRunStatus =
  | "created"
  | "inspecting"
  | "planning"
  | "awaiting_plan_approval"
  | "preparing_workspace"
  | "implementing"
  | "validating"
  | "reviewing"
  | "fixing"
  | "final_validation"
  | "awaiting_final_review"
  | "completed"
  | "failed"
  | "cancelled"
  | "blocked"
  | "interrupted";

export const WORKFLOW_RUN_STATUSES: ReadonlyArray<WorkflowRunStatus> = [
  "created",
  "inspecting",
  "planning",
  "awaiting_plan_approval",
  "preparing_workspace",
  "implementing",
  "validating",
  "reviewing",
  "fixing",
  "final_validation",
  "awaiting_final_review",
  "completed",
  "failed",
  "cancelled",
  "blocked",
  "interrupted",
];

export type TerminalWorkflowRunStatus =
  | "completed"
  | "failed"
  | "cancelled"
  | "blocked"
  | "interrupted";

export const TERMINAL_WORKFLOW_RUN_STATUSES: ReadonlyArray<TerminalWorkflowRunStatus> = [
  "completed",
  "failed",
  "cancelled",
  "blocked",
  "interrupted",
];

export function isTerminalWorkflowRunStatus(status: WorkflowRunStatus): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "blocked" ||
    status === "interrupted"
  );
}

export type RoleId = "planner" | "implementer" | "reviewer";

export const ROLE_IDS: ReadonlyArray<RoleId> = ["planner", "implementer", "reviewer"];

export type RoleExecutionStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "blocked";

export const ROLE_EXECUTION_STATUSES: ReadonlyArray<RoleExecutionStatus> = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
];

export type GateExecutionStatus = "pending" | "running" | "passed" | "failed" | "skipped";

export const GATE_EXECUTION_STATUSES: ReadonlyArray<GateExecutionStatus> = [
  "pending",
  "running",
  "passed",
  "failed",
  "skipped",
];

export type EvidenceStatus = "passed" | "failed" | "warning" | "unknown";

export const EVIDENCE_STATUSES: ReadonlyArray<EvidenceStatus> = [
  "passed",
  "failed",
  "warning",
  "unknown",
];

export type RiskLevel = "low" | "medium" | "high" | "critical";

export const RISK_LEVELS: ReadonlyArray<RiskLevel> = ["low", "medium", "high", "critical"];

export type PolicyDecision = "allow" | "require_approval" | "deny";

export const POLICY_DECISIONS: ReadonlyArray<PolicyDecision> = [
  "allow",
  "require_approval",
  "deny",
];

export type ReviewAssurance =
  | "different_model_fresh_session"
  | "same_model_fresh_session"
  | "review_unavailable";

export const REVIEW_ASSURANCES: ReadonlyArray<ReviewAssurance> = [
  "different_model_fresh_session",
  "same_model_fresh_session",
  "review_unavailable",
];

export type CostStatus = "provider_reported" | "estimated" | "plan_included_or_credit" | "unknown";

export const COST_STATUSES: ReadonlyArray<CostStatus> = [
  "provider_reported",
  "estimated",
  "plan_included_or_credit",
  "unknown",
];

export type AuditActor = "system" | "human" | "cursor_agent";

export const AUDIT_ACTORS: ReadonlyArray<AuditActor> = ["system", "human", "cursor_agent"];
