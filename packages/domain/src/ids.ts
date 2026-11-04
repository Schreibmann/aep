export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

function requireNonEmpty(value: string, code: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new DomainError(code, `${label} must be a non-empty string`);
  }
  return trimmed;
}

export type ProjectId = { readonly kind: "ProjectId"; readonly value: string };
export type TaskId = { readonly kind: "TaskId"; readonly value: string };
export type WorkflowRunId = { readonly kind: "WorkflowRunId"; readonly value: string };
export type RoleExecutionId = { readonly kind: "RoleExecutionId"; readonly value: string };
export type AgentSessionId = { readonly kind: "AgentSessionId"; readonly value: string };
export type WorkspaceId = { readonly kind: "WorkspaceId"; readonly value: string };
export type ApprovalId = { readonly kind: "ApprovalId"; readonly value: string };
export type GateExecutionId = { readonly kind: "GateExecutionId"; readonly value: string };
export type EvidenceId = { readonly kind: "EvidenceId"; readonly value: string };
export type ReviewFindingId = { readonly kind: "ReviewFindingId"; readonly value: string };
export type UsageRecordId = { readonly kind: "UsageRecordId"; readonly value: string };
export type AuditEventId = { readonly kind: "AuditEventId"; readonly value: string };

export function createProjectId(value: string): ProjectId {
  return { kind: "ProjectId", value: requireNonEmpty(value, "invalid_project_id", "ProjectId") };
}

export function createTaskId(value: string): TaskId {
  return { kind: "TaskId", value: requireNonEmpty(value, "invalid_task_id", "TaskId") };
}

export function createWorkflowRunId(value: string): WorkflowRunId {
  return {
    kind: "WorkflowRunId",
    value: requireNonEmpty(value, "invalid_workflow_run_id", "WorkflowRunId"),
  };
}

export function createRoleExecutionId(value: string): RoleExecutionId {
  return {
    kind: "RoleExecutionId",
    value: requireNonEmpty(value, "invalid_role_execution_id", "RoleExecutionId"),
  };
}

export function createAgentSessionId(value: string): AgentSessionId {
  return {
    kind: "AgentSessionId",
    value: requireNonEmpty(value, "invalid_agent_session_id", "AgentSessionId"),
  };
}

export function createWorkspaceId(value: string): WorkspaceId {
  return {
    kind: "WorkspaceId",
    value: requireNonEmpty(value, "invalid_workspace_id", "WorkspaceId"),
  };
}

export function createApprovalId(value: string): ApprovalId {
  return {
    kind: "ApprovalId",
    value: requireNonEmpty(value, "invalid_approval_id", "ApprovalId"),
  };
}

export function createGateExecutionId(value: string): GateExecutionId {
  return {
    kind: "GateExecutionId",
    value: requireNonEmpty(value, "invalid_gate_execution_id", "GateExecutionId"),
  };
}

export function createEvidenceId(value: string): EvidenceId {
  return {
    kind: "EvidenceId",
    value: requireNonEmpty(value, "invalid_evidence_id", "EvidenceId"),
  };
}

export function createReviewFindingId(value: string): ReviewFindingId {
  return {
    kind: "ReviewFindingId",
    value: requireNonEmpty(value, "invalid_review_finding_id", "ReviewFindingId"),
  };
}

export function createUsageRecordId(value: string): UsageRecordId {
  return {
    kind: "UsageRecordId",
    value: requireNonEmpty(value, "invalid_usage_record_id", "UsageRecordId"),
  };
}

export function createAuditEventId(value: string): AuditEventId {
  return {
    kind: "AuditEventId",
    value: requireNonEmpty(value, "invalid_audit_event_id", "AuditEventId"),
  };
}
