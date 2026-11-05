import type { UsageEntry } from "./api/client.js";

export type EconomyCategory =
  | "tokens"
  | "provider_reported_billed"
  | "plan_included"
  | "unknown_cost"
  | "estimated_unavailable";

export type EconomyBucket = {
  readonly category: EconomyCategory;
  readonly label: string;
  readonly entryCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly billedUsdTotal: number | undefined;
  readonly notes: ReadonlyArray<string>;
};

/**
 * Aggregate usage into economy categories.
 * Never treats token counts as dollars without an explicit rate snapshot.
 */
export function aggregateEconomy(entries: ReadonlyArray<UsageEntry>): ReadonlyArray<EconomyBucket> {
  let inputTokens = 0;
  let outputTokens = 0;
  let billedUsd = 0;
  let billedCount = 0;
  let planCount = 0;
  let unknownCount = 0;
  const notes: string[] = [];

  for (const entry of entries) {
    inputTokens += entry.display.tokens.inputTokens ?? 0;
    outputTokens += entry.display.tokens.outputTokens ?? 0;
    if (
      entry.display.costStatus === "provider_reported" &&
      typeof entry.display.billedUsd === "number"
    ) {
      billedUsd += entry.display.billedUsd;
      billedCount += 1;
    } else if (entry.display.costStatus === "plan_included_or_credit") {
      planCount += 1;
    } else {
      unknownCount += 1;
    }
    if (entry.display.note.length > 0) {
      notes.push(entry.display.note);
    }
  }

  return [
    {
      category: "tokens",
      label: "Token counts",
      entryCount: entries.length,
      inputTokens,
      outputTokens,
      billedUsdTotal: undefined,
      notes: ["Tokens are counts only; not converted to currency."],
    },
    {
      category: "provider_reported_billed",
      label: "Provider-reported billed charges",
      entryCount: billedCount,
      inputTokens: 0,
      outputTokens: 0,
      billedUsdTotal: billedCount > 0 ? billedUsd : undefined,
      notes: billedCount > 0 ? ["Sum of provider-reported billedUsd values."] : ["None reported."],
    },
    {
      category: "plan_included",
      label: "Plan-included / credit usage",
      entryCount: planCount,
      inputTokens: 0,
      outputTokens: 0,
      billedUsdTotal: undefined,
      notes: ["Not shown as $0 marginal spend."],
    },
    {
      category: "unknown_cost",
      label: "Unknown costs",
      entryCount: unknownCount,
      inputTokens: 0,
      outputTokens: 0,
      billedUsdTotal: undefined,
      notes: notes.slice(0, 5),
    },
    {
      category: "estimated_unavailable",
      label: "Estimated cost",
      entryCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      billedUsdTotal: undefined,
      notes: [
        "Estimated USD is unavailable without an explicit model rate snapshot (never inferred from tokens alone).",
      ],
    },
  ];
}
