import { COST_STATUSES, type CostStatus, DomainError } from "@aep/domain";
import { eq } from "drizzle-orm";
import type { AepDatabase } from "./open-database.ts";
import { roleExecutions, usageRecords, workflowRuns } from "./schema.ts";

export type InsertUsageRecordInput = {
  readonly id: string;
  readonly workflowRunId: string;
  readonly roleExecutionId: string;
  readonly costStatus: CostStatus;
  readonly createdAt: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  /** Only when provider confirmed a billed amount; never invent 0 for unknown. */
  readonly chargedAmountMinor?: number;
  readonly currency?: "USD";
};

export type UsageRecordRow = {
  readonly id: string;
  readonly workflowRunId: string;
  readonly roleExecutionId: string;
  readonly costStatus: CostStatus;
  readonly createdAt: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
  readonly chargedAmountMinor: number | null;
  readonly currency: string | null;
};

function parseCostStatus(value: string): CostStatus {
  for (const status of COST_STATUSES) {
    if (status === value) {
      return status;
    }
  }
  throw new DomainError("invalid_cost_status", `Unknown costStatus ${value}`);
}

/**
 * Persist a usage row. Does not invent $0: chargedAmountMinor is stored only when provided.
 */
export function insertUsageRecord(database: AepDatabase, input: InsertUsageRecordInput): void {
  const costStatus = parseCostStatus(input.costStatus);
  const run = database.db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(eq(workflowRuns.id, input.workflowRunId))
    .all()[0];
  if (run === undefined) {
    throw new DomainError("run_not_found", `workflow run ${input.workflowRunId} not found`);
  }
  const role = database.db
    .select({ id: roleExecutions.id })
    .from(roleExecutions)
    .where(eq(roleExecutions.id, input.roleExecutionId))
    .all()[0];
  if (role === undefined) {
    throw new DomainError(
      "role_execution_not_found",
      `role execution ${input.roleExecutionId} not found`,
    );
  }

  database.db
    .insert(usageRecords)
    .values({
      id: input.id,
      workflowRunId: input.workflowRunId,
      roleExecutionId: input.roleExecutionId,
      costStatus,
      createdAt: input.createdAt,
      ...(input.inputTokens === undefined ? {} : { inputTokens: input.inputTokens }),
      ...(input.outputTokens === undefined ? {} : { outputTokens: input.outputTokens }),
      ...(input.cacheReadTokens === undefined ? {} : { cacheReadTokens: input.cacheReadTokens }),
      ...(input.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: input.cacheWriteTokens }),
      ...(input.chargedAmountMinor === undefined
        ? {}
        : { chargedAmountMinor: input.chargedAmountMinor }),
      ...(input.currency === undefined ? {} : { currency: input.currency }),
    })
    .run();
}

export function listUsageRecordsForRun(
  database: AepDatabase,
  workflowRunId: string,
): ReadonlyArray<UsageRecordRow> {
  const rows = database.db
    .select()
    .from(usageRecords)
    .where(eq(usageRecords.workflowRunId, workflowRunId))
    .all();
  return rows.map((row) => ({
    id: row.id,
    workflowRunId: row.workflowRunId,
    roleExecutionId: row.roleExecutionId,
    costStatus: parseCostStatus(row.costStatus),
    createdAt: row.createdAt,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheReadTokens: row.cacheReadTokens,
    cacheWriteTokens: row.cacheWriteTokens,
    chargedAmountMinor: row.chargedAmountMinor,
    currency: row.currency,
  }));
}

export type SeedRoleExecutionInput = {
  readonly id: string;
  readonly workflowRunId: string;
  readonly roleId: "planner" | "implementer" | "reviewer";
  readonly status: string;
  readonly attempt: number;
  readonly createdAt: string;
};

export function seedRoleExecution(database: AepDatabase, input: SeedRoleExecutionInput): void {
  database.db
    .insert(roleExecutions)
    .values({
      id: input.id,
      workflowRunId: input.workflowRunId,
      roleId: input.roleId,
      status: input.status,
      attempt: input.attempt,
      createdAt: input.createdAt,
    })
    .run();
}
