import type { RoleId } from "@aep/domain";
import type { UsageResult, UsageTokenCounts } from "@aep/runtime-contracts";

export type UsageSource = "cursor_sdk_run_usage" | "cursor_sdk_get_usage";

export type UsageLedgerEntry = {
  readonly id: string;
  readonly executionId: string;
  readonly roleId: RoleId;
  readonly modelId?: string;
  readonly catalogSnapshotId?: string;
  readonly usage: UsageResult;
  readonly source: UsageSource;
  readonly observedAt: string;
};

/**
 * Human-facing usage view. Dollar amounts appear only when costStatus is provider_reported
 * and billedUsd is a finite number. Unknown cost is never rendered as `$0`.
 */
export type UsageDisplay = {
  readonly status: UsageResult["status"];
  readonly costStatus: UsageResult["costStatus"];
  readonly tokens: UsageTokenCounts;
  readonly costLabel: string;
  readonly billedUsd?: number;
  readonly note: string;
};

export function formatUsageDisplay(usage: UsageResult): UsageDisplay {
  if (usage.status === "feature_unavailable") {
    return {
      status: usage.status,
      costStatus: "unknown",
      tokens: usage.tokens,
      costLabel: "unknown",
      note: "agent.getUsage is feature_unavailable for this account/runtime",
    };
  }

  if (usage.status === "unknown") {
    return {
      status: usage.status,
      costStatus: "unknown",
      tokens: usage.tokens,
      costLabel: "unknown",
      note: "cost unknown; tokens shown without dollar assumptions",
    };
  }

  if (usage.costStatus === "provider_reported" && usage.billedUsd !== undefined) {
    return {
      status: "ok",
      costStatus: "provider_reported",
      tokens: usage.tokens,
      costLabel: `provider_reported_usd:${usage.billedUsd}`,
      billedUsd: usage.billedUsd,
      note: "billed amount reported by Cursor; ownership of charge may be user plan or team",
    };
  }

  if (usage.costStatus === "plan_included_or_credit") {
    return {
      status: "ok",
      costStatus: "plan_included_or_credit",
      tokens: usage.tokens,
      costLabel: "plan_included_or_credit",
      note: "usage counted against included/credit pool; not shown as $0 marginal spend",
    };
  }

  return {
    status: "ok",
    costStatus: usage.costStatus,
    tokens: usage.tokens,
    costLabel: "unknown",
    note: "tokens recorded; dollar cost unknown (never treated as $0)",
  };
}

/**
 * Redact API keys / bearer tokens from provider error text before logging or CLI output.
 */
export function redactProviderError(message: string): string {
  let out = message;
  out = out.replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-[REDACTED]");
  out = out.replace(/key_[A-Za-z0-9_-]{8,}/g, "key_[REDACTED]");
  out = out.replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]");
  out = out.replace(/(api[_-]?key["']?\s*[:=]\s*["']?)[^"'}\s,]+/gi, "$1[REDACTED]");
  out = out.replace(/CURSOR_API_KEY=\S+/g, "CURSOR_API_KEY=[REDACTED]");
  return out;
}

/**
 * In-memory usage ledger for role executions (SQLite projection wiring later).
 */
export class InMemoryUsageLedger {
  private readonly entries = new Map<string, UsageLedgerEntry>();

  save(entry: UsageLedgerEntry): void {
    this.entries.set(entry.id, entry);
  }

  get(id: string): UsageLedgerEntry | undefined {
    return this.entries.get(id);
  }

  listByExecution(executionId: string): ReadonlyArray<UsageLedgerEntry> {
    return [...this.entries.values()].filter((entry) => entry.executionId === executionId);
  }

  list(): ReadonlyArray<UsageLedgerEntry> {
    return [...this.entries.values()];
  }
}
