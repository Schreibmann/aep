import type { WorkflowRun } from "../entities.js";
import { DomainError } from "../ids.js";
import type { RoleId, WorkflowRunStatus } from "../statuses.js";
import { isTerminalWorkflowRunStatus } from "../statuses.js";
import type { WorkflowEvent } from "./events.js";
import {
  hasRequiredCompletionEvidence,
  type CompletionEvidence,
  type WorkflowAggregate,
} from "./state.js";

function requireIsoTimestamp(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new DomainError("invalid_timestamp", `${label} must be a non-empty ISO-8601 timestamp`);
  }
  if (Number.isNaN(Date.parse(trimmed))) {
    throw new DomainError("invalid_timestamp", `${label} must be a valid ISO-8601 timestamp`);
  }
  return trimmed;
}

function withRun(
  state: WorkflowAggregate,
  status: WorkflowRunStatus,
  at: string,
  patch: {
    fixCycleCount?: number;
    roleExecutionCounts?: WorkflowAggregate["roleExecutionCounts"];
    activeWriterCount?: number;
    evidence?: CompletionEvidence;
    openFindingCount?: number;
    pendingGateNames?: ReadonlyArray<string>;
  } = {},
): WorkflowAggregate {
  const run: WorkflowRun = {
    id: state.run.id,
    taskId: state.run.taskId,
    projectId: state.run.projectId,
    status,
    fixCycleCount: patch.fixCycleCount ?? state.run.fixCycleCount,
    createdAt: state.run.createdAt,
    updatedAt: at,
  };
  return {
    run,
    limits: state.limits,
    roleExecutionCounts: patch.roleExecutionCounts ?? state.roleExecutionCounts,
    activeWriterCount: patch.activeWriterCount ?? state.activeWriterCount,
    evidence: patch.evidence ?? state.evidence,
    openFindingCount: patch.openFindingCount ?? state.openFindingCount,
    pendingGateNames: patch.pendingGateNames ?? state.pendingGateNames,
  };
}

function reject(code: string, message: string): never {
  throw new DomainError(code, message);
}

function assertNonTerminal(state: WorkflowAggregate, eventType: string): void {
  if (isTerminalWorkflowRunStatus(state.run.status)) {
    reject(
      "terminal_transition_rejected",
      `Cannot apply ${eventType} to terminal status ${state.run.status}`,
    );
  }
}

function expectStatus(
  state: WorkflowAggregate,
  allowed: ReadonlyArray<WorkflowRunStatus>,
  eventType: string,
): void {
  if (!allowed.includes(state.run.status)) {
    reject(
      "invalid_transition",
      `Event ${eventType} is not valid from status ${state.run.status}`,
    );
  }
}

function incrementRoleCount(state: WorkflowAggregate, roleId: RoleId): WorkflowAggregate["roleExecutionCounts"] {
  const next = state.roleExecutionCounts[roleId] + 1;
  if (next > state.limits.maxRoleExecutions[roleId]) {
    reject(
      "role_execution_limit_exceeded",
      `Role ${roleId} exceeded maxRoleExecutions=${state.limits.maxRoleExecutions[roleId]}`,
    );
  }
  return {
    planner: roleId === "planner" ? next : state.roleExecutionCounts.planner,
    implementer: roleId === "implementer" ? next : state.roleExecutionCounts.implementer,
    reviewer: roleId === "reviewer" ? next : state.roleExecutionCounts.reviewer,
  };
}

function acquireWriter(state: WorkflowAggregate): number {
  const next = state.activeWriterCount + 1;
  if (next > state.limits.maxParallelWriters) {
    reject(
      "active_writer_limit_exceeded",
      `Active writer limit exceeded (maxParallelWriters=${state.limits.maxParallelWriters})`,
    );
  }
  return next;
}

function releaseWriter(state: WorkflowAggregate): number {
  if (state.activeWriterCount <= 0) {
    return 0;
  }
  return state.activeWriterCount - 1;
}

/**
 * Pure deterministic workflow reducer. Application services emit normalized
 * events only; model output never mutates state directly.
 */
export function reduceWorkflow(
  state: WorkflowAggregate,
  event: WorkflowEvent,
): WorkflowAggregate {
  const at = requireIsoTimestamp(event.at, "WorkflowEvent.at");

  switch (event.type) {
    case "inspection_started": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["created"], event.type);
      return withRun(state, "inspecting", at);
    }
    case "repository_inspected": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["inspecting"], event.type);
      return withRun(state, "planning", at);
    }
    case "planning_started": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["planning"], event.type);
      // Role attempt accounting happens only via agent_execution_started.
      return withRun(state, "planning", at);
    }
    case "plan_proposed": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["planning"], event.type);
      return withRun(state, "awaiting_plan_approval", at);
    }
    case "plan_approved": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["awaiting_plan_approval"], event.type);
      if (event.decidedBy.trim().length === 0) {
        reject("invalid_approver", "plan_approved.decidedBy must be non-empty");
      }
      return withRun(state, "preparing_workspace", at, {
        evidence: {
          planApproved: true,
          gatesPassed: state.evidence.gatesPassed,
          reviewApproved: state.evidence.reviewApproved,
          scopeCheckPassed: state.evidence.scopeCheckPassed,
        },
      });
    }
    case "plan_rejected": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["awaiting_plan_approval"], event.type);
      return withRun(state, "blocked", at);
    }
    case "workspace_created": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["preparing_workspace"], event.type);
      return withRun(state, "implementing", at);
    }
    case "agent_execution_started": {
      assertNonTerminal(state, event.type);
      const roleId = event.roleId;
      if (roleId === "planner") {
        expectStatus(state, ["planning"], event.type);
        const roleExecutionCounts = incrementRoleCount(state, roleId);
        return withRun(state, state.run.status, at, { roleExecutionCounts });
      }
      if (roleId === "implementer") {
        expectStatus(state, ["implementing", "fixing"], event.type);
        const roleExecutionCounts = incrementRoleCount(state, roleId);
        const activeWriterCount = acquireWriter(state);
        return withRun(state, state.run.status, at, {
          roleExecutionCounts,
          activeWriterCount,
        });
      }
      expectStatus(state, ["reviewing"], event.type);
      const roleExecutionCounts = incrementRoleCount(state, roleId);
      return withRun(state, state.run.status, at, { roleExecutionCounts });
    }
    case "agent_execution_completed": {
      assertNonTerminal(state, event.type);
      if (event.roleId === "planner") {
        expectStatus(state, ["planning", "awaiting_plan_approval"], event.type);
        return withRun(state, state.run.status, at);
      }
      if (event.roleId === "implementer") {
        expectStatus(state, ["implementing", "fixing"], event.type);
        return withRun(state, "validating", at, {
          activeWriterCount: releaseWriter(state),
          // New implementation invalidates prior gate/review/scope evidence.
          evidence: {
            planApproved: state.evidence.planApproved,
            gatesPassed: false,
            reviewApproved: false,
            scopeCheckPassed: false,
          },
          pendingGateNames: [],
        });
      }
      expectStatus(state, ["reviewing"], event.type);
      return withRun(state, state.run.status, at);
    }
    case "agent_execution_failed": {
      assertNonTerminal(state, event.type);
      if (event.roleId === "implementer") {
        expectStatus(state, ["implementing", "fixing", "planning", "reviewing"], event.type);
        return withRun(state, "failed", at, {
          activeWriterCount: releaseWriter(state),
        });
      }
      expectStatus(state, ["implementing", "fixing", "planning", "reviewing"], event.type);
      return withRun(state, "failed", at);
    }
    case "gate_started": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["validating", "final_validation"], event.type);
      if (event.name.trim().length === 0) {
        reject("invalid_gate_name", "gate_started.name must be non-empty");
      }
      if (state.pendingGateNames.includes(event.name)) {
        reject("duplicate_gate", `Gate ${event.name} is already pending`);
      }
      return withRun(state, state.run.status, at, {
        pendingGateNames: [...state.pendingGateNames, event.name],
      });
    }
    case "gate_passed": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["validating", "final_validation"], event.type);
      if (!state.pendingGateNames.includes(event.name)) {
        reject("unknown_gate", `Gate ${event.name} was not started`);
      }
      const pendingGateNames = state.pendingGateNames.filter((name) => name !== event.name);
      const allClear = pendingGateNames.length === 0;
      if (state.run.status === "validating") {
        if (!allClear) {
          return withRun(state, "validating", at, { pendingGateNames });
        }
        return withRun(state, "reviewing", at, {
          pendingGateNames,
          evidence: {
            planApproved: state.evidence.planApproved,
            gatesPassed: true,
            reviewApproved: state.evidence.reviewApproved,
            scopeCheckPassed: state.evidence.scopeCheckPassed,
          },
        });
      }
      // final_validation: stay until final_validation_passed / scope_check
      return withRun(state, "final_validation", at, {
        pendingGateNames,
        evidence: {
          planApproved: state.evidence.planApproved,
          gatesPassed: allClear ? true : state.evidence.gatesPassed,
          reviewApproved: state.evidence.reviewApproved,
          scopeCheckPassed: state.evidence.scopeCheckPassed,
        },
      });
    }
    case "gate_failed": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["validating", "final_validation"], event.type);
      return withRun(state, "failed", at, {
        pendingGateNames: [],
        evidence: {
          planApproved: state.evidence.planApproved,
          gatesPassed: false,
          reviewApproved: state.evidence.reviewApproved,
          scopeCheckPassed: state.evidence.scopeCheckPassed,
        },
      });
    }
    case "review_submitted": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["reviewing"], event.type);
      if (!Number.isInteger(event.openFindingCount) || event.openFindingCount < 0) {
        reject("invalid_finding_count", "openFindingCount must be a non-negative integer");
      }
      if (event.disposition === "approve") {
        return withRun(state, "final_validation", at, {
          openFindingCount: event.openFindingCount,
          evidence: {
            planApproved: state.evidence.planApproved,
            gatesPassed: state.evidence.gatesPassed,
            reviewApproved: true,
            scopeCheckPassed: false,
          },
        });
      }
      return withRun(state, "reviewing", at, {
        openFindingCount: event.openFindingCount,
        evidence: {
          planApproved: state.evidence.planApproved,
          gatesPassed: state.evidence.gatesPassed,
          reviewApproved: false,
          scopeCheckPassed: state.evidence.scopeCheckPassed,
        },
      });
    }
    case "finding_accepted": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["reviewing"], event.type);
      return withRun(state, "reviewing", at, {
        openFindingCount: state.openFindingCount + 1,
      });
    }
    case "finding_dismissed": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["reviewing"], event.type);
      const next = Math.max(0, state.openFindingCount - 1);
      return withRun(state, "reviewing", at, { openFindingCount: next });
    }
    case "fix_cycle_started": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["reviewing"], event.type);
      if (state.evidence.reviewApproved) {
        reject("invalid_fix_cycle", "Cannot start a fix cycle after review approval");
      }
      const nextCycle = state.run.fixCycleCount + 1;
      if (nextCycle > state.limits.maxFixCycles) {
        reject(
          "fix_cycle_limit_exceeded",
          `Fix cycle limit exceeded (maxFixCycles=${state.limits.maxFixCycles})`,
        );
      }
      return withRun(state, "fixing", at, {
        fixCycleCount: nextCycle,
        evidence: {
          planApproved: state.evidence.planApproved,
          gatesPassed: false,
          reviewApproved: false,
          scopeCheckPassed: false,
        },
      });
    }
    case "budget_threshold_reached": {
      assertNonTerminal(state, event.type);
      return withRun(state, "blocked", at, {
        activeWriterCount: 0,
      });
    }
    case "policy_violation_detected": {
      assertNonTerminal(state, event.type);
      return withRun(state, "blocked", at, {
        activeWriterCount: 0,
      });
    }
    case "final_validation_started": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["final_validation"], event.type);
      return withRun(state, "final_validation", at);
    }
    case "final_validation_passed": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["final_validation"], event.type);
      if (state.pendingGateNames.length > 0) {
        reject("gates_incomplete", "Cannot pass final validation while gates are pending");
      }
      if (!state.evidence.gatesPassed) {
        reject("gates_required", "final_validation_passed requires gatesPassed evidence");
      }
      return withRun(state, "awaiting_final_review", at);
    }
    case "scope_check_passed": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["final_validation", "awaiting_final_review"], event.type);
      return withRun(state, state.run.status, at, {
        evidence: {
          planApproved: state.evidence.planApproved,
          gatesPassed: state.evidence.gatesPassed,
          reviewApproved: state.evidence.reviewApproved,
          scopeCheckPassed: true,
        },
      });
    }
    case "final_report_created": {
      assertNonTerminal(state, event.type);
      expectStatus(state, ["awaiting_final_review"], event.type);
      if (!hasRequiredCompletionEvidence(state.evidence)) {
        reject(
          "completion_evidence_missing",
          "completed requires planApproved, gatesPassed, reviewApproved, and scopeCheckPassed",
        );
      }
      return withRun(state, "completed", at);
    }
    case "run_cancelled": {
      assertNonTerminal(state, event.type);
      return withRun(state, "cancelled", at, { activeWriterCount: 0 });
    }
    case "run_interrupted": {
      assertNonTerminal(state, event.type);
      return withRun(state, "interrupted", at, { activeWriterCount: 0 });
    }
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/**
 * Apply a sequence of events. Useful for tests and projections.
 */
export function reduceWorkflowAll(
  state: WorkflowAggregate,
  events: ReadonlyArray<WorkflowEvent>,
): WorkflowAggregate {
  let current = state;
  for (const event of events) {
    current = reduceWorkflow(current, event);
  }
  return current;
}
