import type { RoleId } from "../statuses.js";

/**
 * Normalized workflow events. Provider/SDK statuses MUST be mapped into these
 * shapes by application services before reaching the reducer.
 */
export type WorkflowEvent =
  | { readonly type: "inspection_started"; readonly at: string }
  | { readonly type: "repository_inspected"; readonly at: string }
  | { readonly type: "planning_started"; readonly at: string }
  | { readonly type: "plan_proposed"; readonly at: string }
  | { readonly type: "plan_approved"; readonly at: string; readonly decidedBy: string }
  | { readonly type: "plan_rejected"; readonly at: string; readonly decidedBy: string }
  | { readonly type: "workspace_created"; readonly at: string }
  | {
      readonly type: "agent_execution_started";
      readonly at: string;
      readonly roleId: RoleId;
    }
  | {
      readonly type: "agent_execution_completed";
      readonly at: string;
      readonly roleId: RoleId;
    }
  | {
      readonly type: "agent_execution_failed";
      readonly at: string;
      readonly roleId: RoleId;
    }
  | { readonly type: "gate_started"; readonly at: string; readonly name: string }
  | { readonly type: "gate_passed"; readonly at: string; readonly name: string }
  | { readonly type: "gate_failed"; readonly at: string; readonly name: string }
  | {
      readonly type: "review_submitted";
      readonly at: string;
      readonly disposition: "approve" | "request_changes";
      readonly openFindingCount: number;
    }
  | { readonly type: "finding_accepted"; readonly at: string }
  | { readonly type: "finding_dismissed"; readonly at: string }
  | { readonly type: "fix_cycle_started"; readonly at: string }
  | { readonly type: "budget_threshold_reached"; readonly at: string }
  | {
      readonly type: "policy_violation_detected";
      readonly at: string;
      readonly reason: string;
    }
  | { readonly type: "final_validation_started"; readonly at: string }
  | { readonly type: "final_validation_passed"; readonly at: string }
  | { readonly type: "scope_check_passed"; readonly at: string }
  | { readonly type: "final_report_created"; readonly at: string }
  | { readonly type: "run_cancelled"; readonly at: string }
  | { readonly type: "run_interrupted"; readonly at: string };

export type WorkflowEventType = WorkflowEvent["type"];

export const WORKFLOW_EVENT_TYPES: ReadonlyArray<WorkflowEventType> = [
  "inspection_started",
  "repository_inspected",
  "planning_started",
  "plan_proposed",
  "plan_approved",
  "plan_rejected",
  "workspace_created",
  "agent_execution_started",
  "agent_execution_completed",
  "agent_execution_failed",
  "gate_started",
  "gate_passed",
  "gate_failed",
  "review_submitted",
  "finding_accepted",
  "finding_dismissed",
  "fix_cycle_started",
  "budget_threshold_reached",
  "policy_violation_detected",
  "final_validation_started",
  "final_validation_passed",
  "scope_check_passed",
  "final_report_created",
  "run_cancelled",
  "run_interrupted",
];
