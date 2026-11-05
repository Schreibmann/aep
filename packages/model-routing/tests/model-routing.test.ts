import type { ModelCatalogSnapshot } from "@aep/runtime-contracts";
import { describe, expect, it } from "vitest";
import { ModelCatalogCache } from "../src/catalog-cache.ts";
import { DEFAULT_COST_POLICY } from "../src/cost-policy.ts";
import { ModelRoutingError } from "../src/errors.ts";
import { listOptimizeForValues, resolveModelForRole } from "../src/resolve-model.ts";

const catalog: ModelCatalogSnapshot = {
  snapshotId: "snap_test_1",
  capturedAt: "2026-11-05T12:00:00.000Z",
  models: [
    {
      id: "account-fast",
      label: "Account Fast",
      billingCategory: "included_or_credit",
    },
    {
      id: "account-deep",
      label: "Account Deep",
      billingCategory: "unknown",
      parameters: [
        {
          id: "optimize_for",
          values: [{ value: "balance" }, { value: "quality" }],
        },
      ],
    },
    {
      id: "paid-extra",
      label: "Paid Extra",
      billingCategory: "extra_spend_possible",
    },
  ],
};

describe("AEP-042 model routing", () => {
  it("refreshes catalog with TTL and refuses empty catalogs", async () => {
    let calls = 0;
    const cache = new ModelCatalogCache({
      ttlMs: 60_000,
      now: () => 1_000 + calls * 10,
    });
    const discover = async (): Promise<ModelCatalogSnapshot> => {
      calls += 1;
      return catalog;
    };
    const first = await cache.getOrRefresh(discover);
    const second = await cache.getOrRefresh(discover);
    expect(first.snapshotId).toBe("snap_test_1");
    expect(second.snapshotId).toBe("snap_test_1");
    expect(calls).toBe(1);

    await expect(
      cache.refresh(async () => ({
        snapshotId: "empty",
        capturedAt: "2026-11-05T12:00:00.000Z",
        models: [],
      })),
    ).rejects.toBeInstanceOf(ModelRoutingError);
  });

  it("selects role preference from catalog without hardcoded vendor defaults", () => {
    const selection = resolveModelForRole({
      roleId: "planner",
      catalog,
      config: {
        roles: [{ roleId: "planner", preferredModelIds: ["account-deep"] }],
      },
    });
    expect(selection.modelId).toBe("account-deep");
    expect(selection.catalogSnapshotId).toBe("snap_test_1");
    expect(selection.rationale).toContain("role_preference");
  });

  it("blocks missing requested model instead of substituting", () => {
    expect(() =>
      resolveModelForRole({
        roleId: "implementer",
        catalog,
        config: { roles: [] },
        requestedModelId: "does-not-exist",
      }),
    ).toThrow(ModelRoutingError);
  });

  it("blocks extra-spend models unless explicitly approved", () => {
    expect(() =>
      resolveModelForRole({
        roleId: "implementer",
        catalog,
        config: { roles: [] },
        costPolicy: DEFAULT_COST_POLICY,
        requestedModelId: "paid-extra",
      }),
    ).toThrow(/extra_spend|not approved/i);

    const allowed = resolveModelForRole({
      roleId: "implementer",
      catalog,
      config: { roles: [] },
      costPolicy: {
        mode: "no_unapproved_extra_spend",
        approvedExtraSpendModelIds: ["paid-extra"],
      },
      requestedModelId: "paid-extra",
    });
    expect(allowed.modelId).toBe("paid-extra");
  });

  it("validates optimize_for against account-enabled values only", () => {
    expect(
      listOptimizeForValues(
        catalog.models[1] ?? { id: "x", label: "x", billingCategory: "unknown" },
      ),
    ).toEqual(["balance", "quality"]);

    expect(() =>
      resolveModelForRole({
        roleId: "planner",
        catalog,
        config: {
          roles: [
            {
              roleId: "planner",
              preferredModelIds: ["account-deep"],
              preferredParams: [{ id: "optimize_for", value: "speed" }],
            },
          ],
        },
      }),
    ).toThrow(ModelRoutingError);

    const ok = resolveModelForRole({
      roleId: "planner",
      catalog,
      config: {
        roles: [
          {
            roleId: "planner",
            preferredModelIds: ["account-deep"],
            preferredParams: [{ id: "optimize_for", value: "quality" }],
          },
        ],
      },
    });
    expect(ok.modelParams).toEqual([{ id: "optimize_for", value: "quality" }]);
  });

  it("prefers a different reviewer model when available", () => {
    const selection = resolveModelForRole({
      roleId: "reviewer",
      catalog,
      config: {
        roles: [
          {
            roleId: "reviewer",
            preferredModelIds: [],
            preferDifferentFromModelId: "account-fast",
          },
        ],
      },
    });
    expect(selection.modelId).not.toBe("account-fast");
    expect(selection.rationale).toContain("reviewer_different_model");
  });
});
