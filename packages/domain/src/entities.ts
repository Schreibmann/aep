import type {
  AgentSessionId,
  ApprovalId,
  AuditEventId,
  EvidenceId,
  GateExecutionId,
  ProjectId,
  ReviewFindingId,
  RoleExecutionId,
  TaskId,
  UsageRecordId,
  WorkflowRunId,
  WorkspaceId,
} from "./ids.ts";
import { DomainError } from "./ids.ts";
import type {
  AuditActor,
  CostStatus,
  EvidenceStatus,
  GateExecutionStatus,
  PolicyDecision,
  ReviewAssurance,
  RiskLevel,
  RoleExecutionStatus,
  RoleId,
  WorkflowRunStatus,
} from "./statuses.ts";
import { isTerminalWorkflowRunStatus } from "./statuses.ts";

function requireIsoTimestamp(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new DomainError("invalid_timestamp", `${label} must be a non-empty ISO-8601 timestamp`);
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    throw new DomainError("invalid_timestamp", `${label} must be a valid ISO-8601 timestamp`);
  }
  return trimmed;
}

function requireNonEmptyText(value: string, code: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new DomainError(code, `${label} must be non-empty`);
  }
  return trimmed;
}

export type Project = {
  readonly id: ProjectId;
  readonly rootPath: string;
  readonly createdAt: string;
};

export function createProject(input: {
  id: ProjectId;
  rootPath: string;
  createdAt: string;
}): Project {
  return {
    id: input.id,
    rootPath: requireNonEmptyText(input.rootPath, "invalid_project_root", "Project.rootPath"),
    createdAt: requireIsoTimestamp(input.createdAt, "Project.createdAt"),
  };
}

export type Task = {
  readonly id: TaskId;
  readonly projectId: ProjectId;
  readonly description: string;
  readonly risk: RiskLevel;
  readonly createdAt: string;
};

export function createTask(input: {
  id: TaskId;
  projectId: ProjectId;
  description: string;
  risk: RiskLevel;
  createdAt: string;
}): Task {
  return {
    id: input.id,
    projectId: input.projectId,
    description: requireNonEmptyText(
      input.description,
      "invalid_task_description",
      "Task.description",
    ),
    risk: input.risk,
    createdAt: requireIsoTimestamp(input.createdAt, "Task.createdAt"),
  };
}

export type WorkflowRun = {
  readonly id: WorkflowRunId;
  readonly taskId: TaskId;
  readonly projectId: ProjectId;
  readonly status: WorkflowRunStatus;
  readonly fixCycleCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export function createWorkflowRun(input: {
  id: WorkflowRunId;
  taskId: TaskId;
  projectId: ProjectId;
  status?: WorkflowRunStatus;
  fixCycleCount?: number;
  createdAt: string;
  updatedAt: string;
}): WorkflowRun {
  const fixCycleCount = input.fixCycleCount ?? 0;
  if (!Number.isInteger(fixCycleCount) || fixCycleCount < 0) {
    throw new DomainError(
      "invalid_fix_cycle_count",
      "fixCycleCount must be a non-negative integer",
    );
  }
  const status = input.status ?? "created";
  return {
    id: input.id,
    taskId: input.taskId,
    projectId: input.projectId,
    status,
    fixCycleCount,
    createdAt: requireIsoTimestamp(input.createdAt, "WorkflowRun.createdAt"),
    updatedAt: requireIsoTimestamp(input.updatedAt, "WorkflowRun.updatedAt"),
  };
}

export function withWorkflowRunStatus(
  run: WorkflowRun,
  status: WorkflowRunStatus,
  updatedAt: string,
): WorkflowRun {
  if (isTerminalWorkflowRunStatus(run.status) && run.status !== status) {
    throw new DomainError(
      "terminal_run_immutable",
      `Cannot transition terminal workflow run from ${run.status} to ${status}`,
    );
  }
  return {
    id: run.id,
    taskId: run.taskId,
    projectId: run.projectId,
    status,
    fixCycleCount: run.fixCycleCount,
    createdAt: run.createdAt,
    updatedAt: requireIsoTimestamp(updatedAt, "WorkflowRun.updatedAt"),
  };
}

export type RoleExecution = {
  readonly id: RoleExecutionId;
  readonly workflowRunId: WorkflowRunId;
  readonly roleId: RoleId;
  readonly status: RoleExecutionStatus;
  readonly attempt: number;
  readonly createdAt: string;
};

export function createRoleExecution(input: {
  id: RoleExecutionId;
  workflowRunId: WorkflowRunId;
  roleId: RoleId;
  status?: RoleExecutionStatus;
  attempt?: number;
  createdAt: string;
}): RoleExecution {
  const attempt = input.attempt ?? 1;
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new DomainError("invalid_role_attempt", "RoleExecution.attempt must be an integer >= 1");
  }
  return {
    id: input.id,
    workflowRunId: input.workflowRunId,
    roleId: input.roleId,
    status: input.status ?? "pending",
    attempt,
    createdAt: requireIsoTimestamp(input.createdAt, "RoleExecution.createdAt"),
  };
}

export type AgentSession = {
  readonly id: AgentSessionId;
  readonly roleExecutionId: RoleExecutionId;
  readonly opaqueAgentId: string;
  readonly modelId: string;
  readonly createdAt: string;
};

export function createAgentSession(input: {
  id: AgentSessionId;
  roleExecutionId: RoleExecutionId;
  opaqueAgentId: string;
  modelId: string;
  createdAt: string;
}): AgentSession {
  return {
    id: input.id,
    roleExecutionId: input.roleExecutionId,
    opaqueAgentId: requireNonEmptyText(
      input.opaqueAgentId,
      "invalid_opaque_agent_id",
      "AgentSession.opaqueAgentId",
    ),
    modelId: requireNonEmptyText(input.modelId, "invalid_model_id", "AgentSession.modelId"),
    createdAt: requireIsoTimestamp(input.createdAt, "AgentSession.createdAt"),
  };
}

export type Workspace = {
  readonly id: WorkspaceId;
  readonly workflowRunId: WorkflowRunId;
  readonly branchName: string;
  readonly worktreePath: string;
  readonly baseCommit: string;
  readonly createdAt: string;
};

export function createWorkspace(input: {
  id: WorkspaceId;
  workflowRunId: WorkflowRunId;
  branchName: string;
  worktreePath: string;
  baseCommit: string;
  createdAt: string;
}): Workspace {
  return {
    id: input.id,
    workflowRunId: input.workflowRunId,
    branchName: requireNonEmptyText(
      input.branchName,
      "invalid_branch_name",
      "Workspace.branchName",
    ),
    worktreePath: requireNonEmptyText(
      input.worktreePath,
      "invalid_worktree_path",
      "Workspace.worktreePath",
    ),
    baseCommit: requireNonEmptyText(
      input.baseCommit,
      "invalid_base_commit",
      "Workspace.baseCommit",
    ),
    createdAt: requireIsoTimestamp(input.createdAt, "Workspace.createdAt"),
  };
}

export type Approval = {
  readonly id: ApprovalId;
  readonly workflowRunId: WorkflowRunId;
  readonly scope: string;
  readonly decision: PolicyDecision;
  readonly decidedBy: string;
  readonly createdAt: string;
};

export function createApproval(input: {
  id: ApprovalId;
  workflowRunId: WorkflowRunId;
  scope: string;
  decision: PolicyDecision;
  decidedBy: string;
  createdAt: string;
}): Approval {
  return {
    id: input.id,
    workflowRunId: input.workflowRunId,
    scope: requireNonEmptyText(input.scope, "invalid_approval_scope", "Approval.scope"),
    decision: input.decision,
    decidedBy: requireNonEmptyText(input.decidedBy, "invalid_approver", "Approval.decidedBy"),
    createdAt: requireIsoTimestamp(input.createdAt, "Approval.createdAt"),
  };
}

export type GateExecution = {
  readonly id: GateExecutionId;
  readonly workflowRunId: WorkflowRunId;
  readonly name: string;
  readonly status: GateExecutionStatus;
  readonly createdAt: string;
};

export function createGateExecution(input: {
  id: GateExecutionId;
  workflowRunId: WorkflowRunId;
  name: string;
  status?: GateExecutionStatus;
  createdAt: string;
}): GateExecution {
  return {
    id: input.id,
    workflowRunId: input.workflowRunId,
    name: requireNonEmptyText(input.name, "invalid_gate_name", "GateExecution.name"),
    status: input.status ?? "pending",
    createdAt: requireIsoTimestamp(input.createdAt, "GateExecution.createdAt"),
  };
}

export type Evidence = {
  readonly id: EvidenceId;
  readonly workflowRunId: WorkflowRunId;
  readonly source: "planner" | "cursor_agent" | "command_runner" | "git" | "human";
  readonly kind: string;
  readonly status: EvidenceStatus;
  readonly summary: string;
  readonly createdAt: string;
};

export function createEvidence(input: {
  id: EvidenceId;
  workflowRunId: WorkflowRunId;
  source: Evidence["source"];
  kind: string;
  status: EvidenceStatus;
  summary: string;
  createdAt: string;
}): Evidence {
  return {
    id: input.id,
    workflowRunId: input.workflowRunId,
    source: input.source,
    kind: requireNonEmptyText(input.kind, "invalid_evidence_kind", "Evidence.kind"),
    status: input.status,
    summary: requireNonEmptyText(input.summary, "invalid_evidence_summary", "Evidence.summary"),
    createdAt: requireIsoTimestamp(input.createdAt, "Evidence.createdAt"),
  };
}

export type ReviewFinding = {
  readonly id: ReviewFindingId;
  readonly workflowRunId: WorkflowRunId;
  readonly severity: "critical" | "high" | "medium" | "low" | "info";
  readonly title: string;
  readonly assurance: ReviewAssurance;
  readonly createdAt: string;
};

export function createReviewFinding(input: {
  id: ReviewFindingId;
  workflowRunId: WorkflowRunId;
  severity: ReviewFinding["severity"];
  title: string;
  assurance: ReviewAssurance;
  createdAt: string;
}): ReviewFinding {
  return {
    id: input.id,
    workflowRunId: input.workflowRunId,
    severity: input.severity,
    title: requireNonEmptyText(input.title, "invalid_finding_title", "ReviewFinding.title"),
    assurance: input.assurance,
    createdAt: requireIsoTimestamp(input.createdAt, "ReviewFinding.createdAt"),
  };
}

export type UsageRecord = {
  readonly id: UsageRecordId;
  readonly workflowRunId: WorkflowRunId;
  readonly roleExecutionId: RoleExecutionId;
  readonly costStatus: CostStatus;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly createdAt: string;
};

export function createUsageRecord(input: {
  id: UsageRecordId;
  workflowRunId: WorkflowRunId;
  roleExecutionId: RoleExecutionId;
  costStatus: CostStatus;
  inputTokens?: number;
  outputTokens?: number;
  createdAt: string;
}): UsageRecord {
  if (input.costStatus !== "unknown") {
    if (input.inputTokens === undefined && input.outputTokens === undefined) {
      // provider_reported / estimated / plan_included may still lack tokens; allowed
    }
  }
  if (
    input.inputTokens !== undefined &&
    (!Number.isFinite(input.inputTokens) || input.inputTokens < 0)
  ) {
    throw new DomainError("invalid_token_count", "inputTokens must be a non-negative number");
  }
  if (
    input.outputTokens !== undefined &&
    (!Number.isFinite(input.outputTokens) || input.outputTokens < 0)
  ) {
    throw new DomainError("invalid_token_count", "outputTokens must be a non-negative number");
  }

  const record: UsageRecord = {
    id: input.id,
    workflowRunId: input.workflowRunId,
    roleExecutionId: input.roleExecutionId,
    costStatus: input.costStatus,
    createdAt: requireIsoTimestamp(input.createdAt, "UsageRecord.createdAt"),
  };

  if (input.inputTokens !== undefined) {
    return {
      ...record,
      inputTokens: input.inputTokens,
      ...(input.outputTokens === undefined ? {} : { outputTokens: input.outputTokens }),
    };
  }
  if (input.outputTokens !== undefined) {
    return {
      ...record,
      outputTokens: input.outputTokens,
    };
  }
  return record;
}

export type AuditEvent = {
  readonly id: AuditEventId;
  readonly workflowRunId: WorkflowRunId;
  readonly actor: AuditActor;
  readonly operation: string;
  readonly createdAt: string;
};

export function createAuditEvent(input: {
  id: AuditEventId;
  workflowRunId: WorkflowRunId;
  actor: AuditActor;
  operation: string;
  createdAt: string;
}): AuditEvent {
  return {
    id: input.id,
    workflowRunId: input.workflowRunId,
    actor: input.actor,
    operation: requireNonEmptyText(
      input.operation,
      "invalid_audit_operation",
      "AuditEvent.operation",
    ),
    createdAt: requireIsoTimestamp(input.createdAt, "AuditEvent.createdAt"),
  };
}

export type PolicyVerdict = {
  readonly decision: PolicyDecision;
  readonly risk: RiskLevel;
  readonly reason: string;
};

export function createPolicyVerdict(input: {
  decision: PolicyDecision;
  risk: RiskLevel;
  reason: string;
}): PolicyVerdict {
  if (input.risk === "critical" && input.decision === "allow") {
    throw new DomainError(
      "invalid_policy_verdict",
      "Critical risk cannot be silently allowed in v1",
    );
  }
  return {
    decision: input.decision,
    risk: input.risk,
    reason: requireNonEmptyText(input.reason, "invalid_policy_reason", "PolicyVerdict.reason"),
  };
}
