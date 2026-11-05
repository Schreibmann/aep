import { describe, expect, it } from "vitest";
import { isModelCostAllowed } from "../src/cost-policy.js";
import {
  authorizeRoleStart,
  clearBudgetApprovalBlock,
  DEFAULT_RUN_BUDGET_POLICY,
  EMPTY_RUN_BUDGET_STATE,
  reconcileUsage,
  recordRoleStart,
} from "../src/run-budget.js";

describe("AEP-056 run budget and cost policy", () => {
  it("stops scheduling new roles at execution threshold", () => {
    let state = EMPTY_RUN_BUDGET_STATE;
    const policy = { ...DEFAULT_RUN_BUDGET_POLICY, maxTotalRoleExecutions: 2 };
    state = recordRoleStart(state, "planner");
    state = recordRoleStart(state, "implementer");
    const denied = authorizeRoleStart(state, policy, "reviewer");
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.code).toBe("budget_total_executions");
    }
  });

  it("marks unknown cost as visible and blocks next role when configured", () => {
    const after = reconcileUsage(EMPTY_RUN_BUDGET_STATE, DEFAULT_RUN_BUDGET_POLICY, {
      status: "unknown",
      costStatus: "unknown",
      tokens: { inputTokens: 10, outputTokens: 2 },
    });
    expect(after.unknownCostObserved).toBe(true);
    expect(after.blockedForApproval).toBe(true);
    const denied = authorizeRoleStart(after, DEFAULT_RUN_BUDGET_POLICY, "reviewer");
    expect(denied.ok).toBe(false);
    const cleared = clearBudgetApprovalBlock(after);
    expect(authorizeRoleStart(cleared, DEFAULT_RUN_BUDGET_POLICY, "reviewer").ok).toBe(true);
  });

  it("never allows unapproved paid model fallback", () => {
    expect(
      isModelCostAllowed(
        { id: "paid-extra", label: "Paid", billingCategory: "extra_spend_possible" },
        {
          mode: "no_unapproved_extra_spend",
          approvedExtraSpendModelIds: [],
          allowPotentialExtraCharge: false,
        },
      ),
    ).toBe(false);
    expect(
      isModelCostAllowed(
        { id: "paid-extra", label: "Paid", billingCategory: "extra_spend_possible" },
        {
          mode: "no_unapproved_extra_spend",
          approvedExtraSpendModelIds: ["paid-extra"],
          allowPotentialExtraCharge: false,
        },
      ),
    ).toBe(true);
  });

  it("reconciles provider-reported spend without inventing dollars for unknown", () => {
    const after = reconcileUsage(
      EMPTY_RUN_BUDGET_STATE,
      { ...DEFAULT_RUN_BUDGET_POLICY, onUnknownCost: "continue", maxProviderReportedSpendUsd: 1 },
      {
        status: "ok",
        costStatus: "provider_reported",
        tokens: { inputTokens: 1 },
        billedUsd: 1.5,
      },
    );
    expect(after.providerReportedSpendUsd).toBe(1.5);
    expect(after.blockedForApproval).toBe(true);
    expect(after.unknownCostObserved).toBe(false);
  });
});
