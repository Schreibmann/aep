import type { ModelCatalogEntry } from "@aep/runtime-contracts";

/**
 * Cost gate for model selection (ADR-011).
 * Never invents dollar amounts; only filters by known billing categories + allowlists.
 */
export type CostPolicy = {
  /**
   * Default: reject models marked `extra_spend_possible` unless id is allowlisted.
   * Models with `unknown` billing stay eligible (account catalog presence is not a charge signal).
   */
  readonly mode: "no_unapproved_extra_spend" | "allow_all_catalog_models";
  /** Explicit user approval for potentially chargeable model IDs. */
  readonly approvedExtraSpendModelIds: ReadonlyArray<string>;
};

export const DEFAULT_COST_POLICY: CostPolicy = {
  mode: "no_unapproved_extra_spend",
  approvedExtraSpendModelIds: [],
};

export function isModelCostAllowed(entry: ModelCatalogEntry, policy: CostPolicy): boolean {
  if (policy.mode === "allow_all_catalog_models") {
    return true;
  }
  if (entry.billingCategory !== "extra_spend_possible") {
    return true;
  }
  return policy.approvedExtraSpendModelIds.includes(entry.id);
}
