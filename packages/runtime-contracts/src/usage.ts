import type { CostStatus } from "@aep/domain";

export type UsageTokenCounts = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
};

export type UsageResult =
  | {
      readonly status: "ok";
      readonly costStatus: CostStatus;
      readonly tokens: UsageTokenCounts;
      /** Present only when a provider confirmed a dollar amount. */
      readonly billedUsd?: number;
    }
  | {
      readonly status: "feature_unavailable";
      readonly costStatus: "unknown";
      readonly tokens: UsageTokenCounts;
    }
  | {
      readonly status: "unknown";
      readonly costStatus: "unknown";
      readonly tokens: UsageTokenCounts;
    };
