import { DomainError } from "../ids.js";
import type { RoleId } from "../statuses.js";

export type WorkflowLimits = {
  readonly maxFixCycles: number;
  readonly maxRoleExecutions: Readonly<Record<RoleId, number>>;
  readonly maxParallelWriters: number;
};

export const DEFAULT_WORKFLOW_LIMITS: WorkflowLimits = {
  maxFixCycles: 2,
  maxRoleExecutions: {
    planner: 3,
    implementer: 5,
    reviewer: 5,
  },
  maxParallelWriters: 1,
};

export function createWorkflowLimits(
  input: Partial<{
    maxFixCycles: number;
    maxRoleExecutions: Partial<Record<RoleId, number>>;
    maxParallelWriters: number;
  }> = {},
): WorkflowLimits {
  const maxFixCycles = input.maxFixCycles ?? DEFAULT_WORKFLOW_LIMITS.maxFixCycles;
  if (!Number.isInteger(maxFixCycles) || maxFixCycles < 0) {
    throw new DomainError("invalid_max_fix_cycles", "maxFixCycles must be a non-negative integer");
  }

  const maxParallelWriters = input.maxParallelWriters ?? DEFAULT_WORKFLOW_LIMITS.maxParallelWriters;
  if (!Number.isInteger(maxParallelWriters) || maxParallelWriters < 1) {
    throw new DomainError(
      "invalid_max_parallel_writers",
      "maxParallelWriters must be an integer >= 1",
    );
  }

  const planner =
    input.maxRoleExecutions?.planner ?? DEFAULT_WORKFLOW_LIMITS.maxRoleExecutions.planner;
  const implementer =
    input.maxRoleExecutions?.implementer ?? DEFAULT_WORKFLOW_LIMITS.maxRoleExecutions.implementer;
  const reviewer =
    input.maxRoleExecutions?.reviewer ?? DEFAULT_WORKFLOW_LIMITS.maxRoleExecutions.reviewer;

  for (const [role, value] of [
    ["planner", planner],
    ["implementer", implementer],
    ["reviewer", reviewer],
  ] as const) {
    if (!Number.isInteger(value) || value < 1) {
      throw new DomainError(
        "invalid_max_role_executions",
        `maxRoleExecutions.${role} must be an integer >= 1`,
      );
    }
  }

  return {
    maxFixCycles,
    maxRoleExecutions: {
      planner,
      implementer,
      reviewer,
    },
    maxParallelWriters,
  };
}
