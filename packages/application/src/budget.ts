import type { RoleId } from "@aep/domain";
import {
  authorizeRoleStart,
  DEFAULT_RUN_BUDGET_POLICY,
  EMPTY_RUN_BUDGET_STATE,
  type RunBudgetPolicy,
  type RunBudgetState,
  reconcileUsage,
  recordRoleStart,
} from "@aep/model-routing";
import type { UsageResult } from "@aep/runtime-contracts";
import { ApplicationError } from "./errors.js";

export function budgetPolicyOrDefault(policy: RunBudgetPolicy | undefined): RunBudgetPolicy {
  return policy ?? DEFAULT_RUN_BUDGET_POLICY;
}

export function budgetStateOrEmpty(state: RunBudgetState | undefined): RunBudgetState {
  return state ?? EMPTY_RUN_BUDGET_STATE;
}

export function beginRoleUnderBudget(input: {
  readonly state: RunBudgetState | undefined;
  readonly policy: RunBudgetPolicy | undefined;
  readonly roleId: RoleId;
}): RunBudgetState {
  const policy = budgetPolicyOrDefault(input.policy);
  const state = budgetStateOrEmpty(input.state);
  const auth = authorizeRoleStart(state, policy, input.roleId);
  if (!auth.ok) {
    throw new ApplicationError(auth.code, auth.message);
  }
  return recordRoleStart(state, input.roleId);
}

export function finishRoleUsage(input: {
  readonly state: RunBudgetState;
  readonly policy: RunBudgetPolicy | undefined;
  readonly usage: UsageResult;
}): RunBudgetState {
  return reconcileUsage(input.state, budgetPolicyOrDefault(input.policy), input.usage);
}
