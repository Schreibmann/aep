import { describe, expect, it } from "vitest";
import type { UsageEntry } from "../src/api/client.js";
import { aggregateEconomy } from "../src/economy.js";

describe("AEP-073 economy aggregation", () => {
  it("keeps billed, plan-included, unknown, and estimated categories separate", () => {
    const entries: UsageEntry[] = [
      {
        id: "u1",
        executionId: "e1",
        roleId: "planner",
        source: "cursor_sdk_get_usage",
        observedAt: "2026-11-05T00:00:00.000Z",
        display: {
          status: "ok",
          costStatus: "provider_reported",
          tokens: { inputTokens: 10, outputTokens: 5 },
          costLabel: "provider_reported_usd:0.02",
          billedUsd: 0.02,
          note: "billed",
        },
      },
      {
        id: "u2",
        executionId: "e2",
        roleId: "implementer",
        source: "cursor_sdk_run_usage",
        observedAt: "2026-11-05T00:00:00.000Z",
        display: {
          status: "ok",
          costStatus: "plan_included_or_credit",
          tokens: { inputTokens: 3, outputTokens: 1 },
          costLabel: "plan_included_or_credit",
          note: "included",
        },
      },
      {
        id: "u3",
        executionId: "e3",
        roleId: "reviewer",
        source: "cursor_sdk_get_usage",
        observedAt: "2026-11-05T00:00:00.000Z",
        display: {
          status: "unknown",
          costStatus: "unknown",
          tokens: { inputTokens: 2, outputTokens: 2 },
          costLabel: "unknown",
          note: "unknown cost",
        },
      },
    ];

    const buckets = aggregateEconomy(entries);
    const tokens = buckets.find((b) => b.category === "tokens");
    const billed = buckets.find((b) => b.category === "provider_reported_billed");
    const plan = buckets.find((b) => b.category === "plan_included");
    const unknown = buckets.find((b) => b.category === "unknown_cost");
    const estimated = buckets.find((b) => b.category === "estimated_unavailable");

    expect(tokens?.inputTokens).toBe(15);
    expect(tokens?.outputTokens).toBe(8);
    expect(billed?.billedUsdTotal).toBe(0.02);
    expect(plan?.entryCount).toBe(1);
    expect(unknown?.entryCount).toBe(1);
    expect(estimated?.notes[0]).toMatch(/rate snapshot/i);
  });
});
