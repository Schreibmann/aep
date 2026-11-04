import {
  DomainError,
  type RoleId,
  WORKFLOW_EVENT_TYPES,
  type WorkflowEvent,
  type WorkflowEventType,
} from "@aep/domain";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainError("invalid_event_payload", `Event field ${key} must be a non-empty string`);
  }
  return value;
}

function requireRoleId(value: unknown): RoleId {
  if (value === "planner" || value === "implementer" || value === "reviewer") {
    return value;
  }
  throw new DomainError("invalid_event_payload", "Event roleId is invalid");
}

function isWorkflowEventType(value: string): value is WorkflowEventType {
  for (const candidate of WORKFLOW_EVENT_TYPES) {
    if (candidate === value) {
      return true;
    }
  }
  return false;
}

/**
 * Decode a journal payload into a domain WorkflowEvent without type assertions.
 */
export function decodeWorkflowEvent(payload: unknown): WorkflowEvent {
  if (!isRecord(payload)) {
    throw new DomainError("invalid_event_payload", "Event payload must be an object");
  }
  const typeValue = requireString(payload, "type");
  if (!isWorkflowEventType(typeValue)) {
    throw new DomainError("invalid_event_payload", `Unknown event type ${typeValue}`);
  }
  const at = requireString(payload, "at");

  switch (typeValue) {
    case "inspection_started":
    case "repository_inspected":
    case "planning_started":
    case "plan_proposed":
    case "workspace_created":
    case "finding_accepted":
    case "finding_dismissed":
    case "fix_cycle_started":
    case "budget_threshold_reached":
    case "final_validation_started":
    case "final_validation_passed":
    case "scope_check_passed":
    case "final_report_created":
    case "run_cancelled":
    case "run_interrupted":
      return { type: typeValue, at };
    case "plan_approved":
    case "plan_rejected":
      return { type: typeValue, at, decidedBy: requireString(payload, "decidedBy") };
    case "agent_execution_started":
    case "agent_execution_completed":
    case "agent_execution_failed":
      return { type: typeValue, at, roleId: requireRoleId(payload.roleId) };
    case "gate_started":
    case "gate_passed":
    case "gate_failed":
      return { type: typeValue, at, name: requireString(payload, "name") };
    case "review_submitted": {
      const disposition = payload.disposition;
      if (disposition !== "approve" && disposition !== "request_changes") {
        throw new DomainError("invalid_event_payload", "review_submitted.disposition invalid");
      }
      const openFindingCount = payload.openFindingCount;
      if (
        typeof openFindingCount !== "number" ||
        !Number.isInteger(openFindingCount) ||
        openFindingCount < 0
      ) {
        throw new DomainError("invalid_event_payload", "review_submitted.openFindingCount invalid");
      }
      return { type: typeValue, at, disposition, openFindingCount };
    }
    case "policy_violation_detected":
      return { type: typeValue, at, reason: requireString(payload, "reason") };
    default: {
      const exhaustive: never = typeValue;
      return exhaustive;
    }
  }
}

export function encodeWorkflowEvent(event: WorkflowEvent): string {
  return JSON.stringify(event);
}
