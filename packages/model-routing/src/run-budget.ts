import type { RoleId } from "@aep/domain";
import type { UsageResult } from "@aep/runtime-contracts";

export type UnknownCostAction = "continue" | "require_approval" | "block_next_role";

/**
 * Per-run budget limits. Dollar caps apply only when provider reports billedUsd.
 * Never claim a hard local-run dollar cap without provider data.
 */
export type RunBudgetPolicy = {
  readonly maxTotalRoleExecutions: number;
  readonly maxExecutionsPerRole: number;
  readonly maxInputTokens?: number;
  readonly maxOutputTokens?: number;
  /** Soft internal spend threshold in USD; only checked against provider_reported billedUsd. */
  readonly maxProviderReportedSpendUsd?: number;
  readonly onUnknownCost: UnknownCostAction;
  /** When false, models with extra_spend_possible still need explicit ID approval (CostPolicy). */
  readonly allowPotentialExtraCharge: boolean;
};

export const DEFAULT_RUN_BUDGET_POLICY: RunBudgetPolicy = {
  maxTotalRoleExecutions: 12,
  maxExecutionsPerRole: 4,
  /** Opt into require_approval/block_next_role when the project configures stricter cost gates. */
  onUnknownCost: "continue",
  allowPotentialExtraCharge: false,
};

export type RoleExecutionBudgetCounts = {
  readonly planner: number;
  readonly implementer: number;
  readonly reviewer: number;
};

export type RunBudgetState = {
  readonly roleExecutions: RoleExecutionBudgetCounts;
  readonly totalRoleExecutions: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly providerReportedSpendUsd: number;
  readonly unknownCostObserved: boolean;
  readonly blockedForApproval: boolean;
  readonly blockReason?: string;
};

export const EMPTY_RUN_BUDGET_STATE: RunBudgetState = {
  roleExecutions: { planner: 0, implementer: 0, reviewer: 0 },
  totalRoleExecutions: 0,
  inputTokens: 0,
  outputTokens: 0,
  providerReportedSpendUsd: 0,
  unknownCostObserved: false,
  blockedForApproval: false,
};

export type BudgetAuthorization =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly message: string };

export function authorizeRoleStart(
  state: RunBudgetState,
  policy: RunBudgetPolicy,
  roleId: RoleId,
): BudgetAuthorization {
  if (state.blockedForApproval) {
    return {
      ok: false,
      code: "budget_approval_required",
      message: state.blockReason ?? "Budget threshold requires human continuation approval",
    };
  }
  if (state.totalRoleExecutions >= policy.maxTotalRoleExecutions) {
    return {
      ok: false,
      code: "budget_total_executions",
      message: `maxTotalRoleExecutions=${policy.maxTotalRoleExecutions} reached`,
    };
  }
  const roleCount = state.roleExecutions[roleId];
  if (roleCount >= policy.maxExecutionsPerRole) {
    return {
      ok: false,
      code: "budget_role_executions",
      message: `maxExecutionsPerRole=${policy.maxExecutionsPerRole} reached for ${roleId}`,
    };
  }
  if (policy.maxInputTokens !== undefined && state.inputTokens >= policy.maxInputTokens) {
    return {
      ok: false,
      code: "budget_input_tokens",
      message: `maxInputTokens=${policy.maxInputTokens} reached`,
    };
  }
  if (policy.maxOutputTokens !== undefined && state.outputTokens >= policy.maxOutputTokens) {
    return {
      ok: false,
      code: "budget_output_tokens",
      message: `maxOutputTokens=${policy.maxOutputTokens} reached`,
    };
  }
  if (
    policy.maxProviderReportedSpendUsd !== undefined &&
    state.providerReportedSpendUsd >= policy.maxProviderReportedSpendUsd
  ) {
    return {
      ok: false,
      code: "budget_provider_spend",
      message: `maxProviderReportedSpendUsd=${policy.maxProviderReportedSpendUsd} reached`,
    };
  }
  return { ok: true };
}

export function recordRoleStart(state: RunBudgetState, roleId: RoleId): RunBudgetState {
  return {
    ...state,
    totalRoleExecutions: state.totalRoleExecutions + 1,
    roleExecutions: {
      ...state.roleExecutions,
      [roleId]: state.roleExecutions[roleId] + 1,
    },
  };
}

/**
 * Reconcile usage after a role finishes. Unknown cost triggers configured action.
 */
export function reconcileUsage(
  state: RunBudgetState,
  policy: RunBudgetPolicy,
  usage: UsageResult,
): RunBudgetState {
  const input = usage.tokens.inputTokens ?? 0;
  const output = usage.tokens.outputTokens ?? 0;
  let next: RunBudgetState = {
    ...state,
    inputTokens: state.inputTokens + input,
    outputTokens: state.outputTokens + output,
  };

  if (usage.costStatus === "provider_reported" && usage.billedUsd !== undefined) {
    next = {
      ...next,
      providerReportedSpendUsd: next.providerReportedSpendUsd + usage.billedUsd,
    };
  }

  const unknown =
    usage.status === "unknown" ||
    usage.status === "feature_unavailable" ||
    usage.costStatus === "unknown";

  if (unknown) {
    next = { ...next, unknownCostObserved: true };
    if (policy.onUnknownCost === "block_next_role" || policy.onUnknownCost === "require_approval") {
      next = {
        ...next,
        blockedForApproval: true,
        blockReason: `Unknown cost observed (action=${policy.onUnknownCost}); human continuation required before next role`,
      };
    }
  }

  if (
    policy.maxProviderReportedSpendUsd !== undefined &&
    next.providerReportedSpendUsd >= policy.maxProviderReportedSpendUsd
  ) {
    next = {
      ...next,
      blockedForApproval: true,
      blockReason: `Provider-reported spend threshold ${policy.maxProviderReportedSpendUsd} reached`,
    };
  }

  return next;
}

export function clearBudgetApprovalBlock(state: RunBudgetState): RunBudgetState {
  const { blockReason: _removed, ...rest } = state;
  return {
    ...rest,
    blockedForApproval: false,
  };
}
