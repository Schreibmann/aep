import { type AuditActor, DomainError } from "@aep/domain";
import { asc, desc, eq } from "drizzle-orm";
import type { AepDatabase } from "./open-database.js";
import { evidence, tasks, workflowEvents, workflowRuns } from "./schema.js";

export type TimelineEntry = {
  readonly id: string;
  readonly sequence: number;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly schemaVersion: number;
  readonly actor: AuditActor;
  readonly operationOrigin: string;
  readonly payloadJson: string;
  readonly createdAt: string;
};

export type TaskListItem = {
  readonly id: string;
  readonly projectId: string;
  readonly description: string;
  readonly risk: string;
  readonly createdAt: string;
  readonly latestRunId?: string;
  readonly latestRunStatus?: string;
};

export type EvidenceListItem = {
  readonly id: string;
  readonly workflowRunId: string;
  readonly source: string;
  readonly kind: string;
  readonly status: string;
  readonly summary: string;
  readonly createdAt: string;
};

function parseAuditActor(value: string): AuditActor {
  if (value === "system" || value === "human" || value === "cursor_agent") {
    return value;
  }
  throw new DomainError("invalid_journal_row", `Unknown actor ${value}`);
}

export function listRunTimeline(
  database: AepDatabase,
  workflowRunId: string,
): ReadonlyArray<TimelineEntry> {
  const trimmed = workflowRunId.trim();
  if (trimmed.length === 0) {
    throw new DomainError("invalid_journal_input", "workflowRunId must be non-empty");
  }
  const rows = database.db
    .select()
    .from(workflowEvents)
    .where(eq(workflowEvents.workflowRunId, trimmed))
    .orderBy(asc(workflowEvents.sequence))
    .all();
  return rows.map((row) => ({
    id: row.id,
    sequence: row.sequence,
    eventType: row.eventType,
    eventVersion: row.eventVersion,
    schemaVersion: row.schemaVersion,
    actor: parseAuditActor(row.actor),
    operationOrigin: row.operationOrigin,
    payloadJson: row.payloadJson,
    createdAt: row.createdAt,
  }));
}

export function listTasks(database: AepDatabase): ReadonlyArray<TaskListItem> {
  const taskRows = database.db.select().from(tasks).orderBy(desc(tasks.createdAt)).all();
  const runRows = database.db.select().from(workflowRuns).all();

  return taskRows.map((task) => {
    let latest: { id: string; status: string; updatedAt: string } | undefined;
    for (const run of runRows) {
      if (run.taskId !== task.id) {
        continue;
      }
      if (latest === undefined || run.updatedAt > latest.updatedAt) {
        latest = { id: run.id, status: run.status, updatedAt: run.updatedAt };
      }
    }
    if (latest === undefined) {
      return {
        id: task.id,
        projectId: task.projectId,
        description: task.description,
        risk: task.risk,
        createdAt: task.createdAt,
      };
    }
    return {
      id: task.id,
      projectId: task.projectId,
      description: task.description,
      risk: task.risk,
      createdAt: task.createdAt,
      latestRunId: latest.id,
      latestRunStatus: latest.status,
    };
  });
}

export function listEvidence(
  database: AepDatabase,
  workflowRunId?: string,
): ReadonlyArray<EvidenceListItem> {
  const rows =
    workflowRunId === undefined || workflowRunId.trim().length === 0
      ? database.db.select().from(evidence).orderBy(asc(evidence.createdAt)).all()
      : database.db
          .select()
          .from(evidence)
          .where(eq(evidence.workflowRunId, workflowRunId.trim()))
          .orderBy(asc(evidence.createdAt))
          .all();

  return rows.map((row) => ({
    id: row.id,
    workflowRunId: row.workflowRunId,
    source: row.source,
    kind: row.kind,
    status: row.status,
    summary: row.summary,
    createdAt: row.createdAt,
  }));
}
