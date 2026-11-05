import {
  type AuditActor,
  createInitialWorkflowAggregate,
  createProjectId,
  createTaskId,
  createWorkflowRunId,
  DomainError,
  type RiskLevel,
  reduceWorkflow,
  reduceWorkflowAll,
  type WorkflowAggregate,
  type WorkflowEvent,
  type WorkflowRunStatus,
} from "@aep/domain";
import { asc, eq, max } from "drizzle-orm";
import { decodeWorkflowEvent, encodeWorkflowEvent } from "./event-codec.ts";
import type { AepDatabase } from "./open-database.ts";
import { evidence, projects, tasks, workflowEvents, workflowRuns } from "./schema.ts";

export const EVENT_SCHEMA_VERSION = 1;
export const EVENT_PAYLOAD_VERSION = 1;

export type SeedRunInput = {
  readonly projectId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly rootPath: string;
  readonly description: string;
  readonly risk: RiskLevel;
  readonly createdAt: string;
};

export type AppendJournalEventInput = {
  readonly eventId: string;
  readonly workflowRunId: string;
  readonly event: WorkflowEvent;
  readonly actor: AuditActor;
  readonly operationOrigin: string;
};

export type AppendJournalEventResult =
  | {
      readonly status: "applied";
      readonly sequence: number;
      readonly aggregate: WorkflowAggregate;
    }
  | {
      readonly status: "duplicate";
      readonly sequence: number;
    };

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new DomainError("invalid_journal_input", `${label} must be non-empty`);
  }
  return trimmed;
}

function parseWorkflowRunStatus(value: string): WorkflowRunStatus {
  const known: ReadonlyArray<WorkflowRunStatus> = [
    "created",
    "inspecting",
    "planning",
    "awaiting_plan_approval",
    "preparing_workspace",
    "implementing",
    "validating",
    "reviewing",
    "fixing",
    "final_validation",
    "awaiting_final_review",
    "completed",
    "failed",
    "cancelled",
    "blocked",
    "interrupted",
  ];
  for (const status of known) {
    if (status === value) {
      return status;
    }
  }
  throw new DomainError("invalid_projection", `Unknown workflow run status ${value}`);
}

function readRunRow(database: AepDatabase, workflowRunId: string) {
  const rows = database.db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, workflowRunId))
    .all();
  const row = rows[0];
  if (row === undefined) {
    throw new DomainError("run_not_found", `workflow run ${workflowRunId} not found`);
  }
  return {
    taskId: row.taskId,
    projectId: row.projectId,
    status: parseWorkflowRunStatus(row.status),
    fixCycleCount: row.fixCycleCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function nextSequence(database: AepDatabase, workflowRunId: string): number {
  const rows = database.db
    .select({ value: max(workflowEvents.sequence) })
    .from(workflowEvents)
    .where(eq(workflowEvents.workflowRunId, workflowRunId))
    .all();
  const current = rows[0]?.value;
  if (typeof current !== "number") {
    return 1;
  }
  return current + 1;
}

function loadJournalEvents(
  database: AepDatabase,
  workflowRunId: string,
): ReadonlyArray<WorkflowEvent> {
  const rows = database.db
    .select()
    .from(workflowEvents)
    .where(eq(workflowEvents.workflowRunId, workflowRunId))
    .orderBy(asc(workflowEvents.sequence))
    .all();
  return rows.map((row) => {
    const parsed: unknown = JSON.parse(row.payloadJson);
    return decodeWorkflowEvent(parsed);
  });
}

function rebuildAggregate(database: AepDatabase, workflowRunId: string): WorkflowAggregate {
  const run = readRunRow(database, workflowRunId);
  const initial = createInitialWorkflowAggregate({
    id: createWorkflowRunId(workflowRunId),
    taskId: createTaskId(run.taskId),
    projectId: createProjectId(run.projectId),
    createdAt: run.createdAt,
  });
  return reduceWorkflowAll(initial, loadJournalEvents(database, workflowRunId));
}

function writeRunProjection(database: AepDatabase, aggregate: WorkflowAggregate): void {
  database.db
    .update(workflowRuns)
    .set({
      status: aggregate.run.status,
      fixCycleCount: aggregate.run.fixCycleCount,
      updatedAt: aggregate.run.updatedAt,
    })
    .where(eq(workflowRuns.id, aggregate.run.id.value))
    .run();
}

/**
 * Seed project/task/run projection rows (status=created) before journaling events.
 */
export function seedWorkflowRun(database: AepDatabase, input: SeedRunInput): void {
  const projectId = requireNonEmpty(input.projectId, "projectId");
  const taskId = requireNonEmpty(input.taskId, "taskId");
  const runId = requireNonEmpty(input.runId, "runId");
  const createdAt = requireNonEmpty(input.createdAt, "createdAt");

  const tx = database.sqlite.transaction(() => {
    database.db
      .insert(projects)
      .values({
        id: projectId,
        rootPath: requireNonEmpty(input.rootPath, "rootPath"),
        createdAt,
      })
      .run();
    database.db
      .insert(tasks)
      .values({
        id: taskId,
        projectId,
        description: requireNonEmpty(input.description, "description"),
        risk: input.risk,
        createdAt,
      })
      .run();
    database.db
      .insert(workflowRuns)
      .values({
        id: runId,
        taskId,
        projectId,
        status: "created",
        fixCycleCount: 0,
        createdAt,
        updatedAt: createdAt,
      })
      .run();
  });
  tx();
}

/**
 * Append a versioned journal event and update the workflow_runs projection
 * in a single SQLite transaction. Duplicate event IDs are idempotent.
 */
export function appendWorkflowEvent(
  database: AepDatabase,
  input: AppendJournalEventInput,
): AppendJournalEventResult {
  const eventId = requireNonEmpty(input.eventId, "eventId");
  const workflowRunId = requireNonEmpty(input.workflowRunId, "workflowRunId");
  const operationOrigin = requireNonEmpty(input.operationOrigin, "operationOrigin");

  const existing = database.db
    .select()
    .from(workflowEvents)
    .where(eq(workflowEvents.id, eventId))
    .all()[0];
  if (existing !== undefined) {
    return { status: "duplicate", sequence: existing.sequence };
  }

  const tx = database.sqlite.transaction(() => {
    const before = rebuildAggregate(database, workflowRunId);
    const after = reduceWorkflow(before, input.event);
    const sequence = nextSequence(database, workflowRunId);

    database.db
      .insert(workflowEvents)
      .values({
        id: eventId,
        workflowRunId,
        sequence,
        eventType: input.event.type,
        eventVersion: EVENT_PAYLOAD_VERSION,
        schemaVersion: EVENT_SCHEMA_VERSION,
        actor: input.actor,
        operationOrigin,
        payloadJson: encodeWorkflowEvent(input.event),
        createdAt: input.event.at,
      })
      .run();

    writeRunProjection(database, after);

    if (input.event.type === "gate_passed" || input.event.type === "gate_failed") {
      database.db
        .insert(evidence)
        .values({
          id: `${eventId}:evidence`,
          workflowRunId,
          source: "command_runner",
          kind: `gate:${input.event.name}`,
          status: input.event.type === "gate_passed" ? "passed" : "failed",
          summary: `Gate ${input.event.name} ${
            input.event.type === "gate_passed" ? "passed" : "failed"
          }`,
          createdAt: input.event.at,
        })
        .run();
    }

    const applied: AppendJournalEventResult = {
      status: "applied",
      sequence,
      aggregate: after,
    };
    return applied;
  });

  return tx();
}

/**
 * Rebuild projection from journal and overwrite workflow_runs.
 */
export function replayWorkflowRun(database: AepDatabase, workflowRunId: string): WorkflowAggregate {
  const tx = database.sqlite.transaction(() => {
    const aggregate = rebuildAggregate(database, requireNonEmpty(workflowRunId, "workflowRunId"));
    writeRunProjection(database, aggregate);
    return aggregate;
  });
  return tx();
}

export function getWorkflowRunProjection(
  database: AepDatabase,
  workflowRunId: string,
): {
  readonly id: string;
  readonly taskId: string;
  readonly projectId: string;
  readonly status: WorkflowRunStatus;
  readonly fixCycleCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
} {
  const row = readRunRow(database, requireNonEmpty(workflowRunId, "workflowRunId"));
  return {
    id: workflowRunId,
    taskId: row.taskId,
    projectId: row.projectId,
    status: row.status,
    fixCycleCount: row.fixCycleCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
