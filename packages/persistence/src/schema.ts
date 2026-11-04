import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Drizzle schema for AEP canonical SQLite DB.
 * Cursor SDK session/conversation storage stays outside this schema (ADR-005 / ADR-006).
 * Never store API keys or other secrets in these columns.
 */

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  rootPath: text("root_path").notNull(),
  createdAt: text("created_at").notNull(),
});

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    description: text("description").notNull(),
    risk: text("risk").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("tasks_project_id_idx").on(table.projectId)],
);

export const workflowRuns = sqliteTable(
  "workflow_runs",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    status: text("status").notNull(),
    fixCycleCount: integer("fix_cycle_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("workflow_runs_task_id_idx").on(table.taskId),
    index("workflow_runs_project_id_idx").on(table.projectId),
    index("workflow_runs_status_idx").on(table.status),
  ],
);

export const roleExecutions = sqliteTable(
  "role_executions",
  {
    id: text("id").primaryKey(),
    workflowRunId: text("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id),
    roleId: text("role_id").notNull(),
    status: text("status").notNull(),
    attempt: integer("attempt").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("role_executions_workflow_run_id_idx").on(table.workflowRunId)],
);

export const agentSessions = sqliteTable(
  "agent_sessions",
  {
    id: text("id").primaryKey(),
    roleExecutionId: text("role_execution_id")
      .notNull()
      .references(() => roleExecutions.id),
    /** Opaque Cursor agent id — not a credential. */
    opaqueAgentId: text("opaque_agent_id").notNull(),
    modelId: text("model_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("agent_sessions_role_execution_id_idx").on(table.roleExecutionId)],
);

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    workflowRunId: text("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id),
    branchName: text("branch_name").notNull(),
    worktreePath: text("worktree_path").notNull(),
    baseCommit: text("base_commit").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("workspaces_workflow_run_id_idx").on(table.workflowRunId)],
);

export const workflowEvents = sqliteTable(
  "workflow_events",
  {
    id: text("id").primaryKey(),
    workflowRunId: text("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id),
    sequence: integer("sequence").notNull(),
    eventType: text("event_type").notNull(),
    eventVersion: integer("event_version").notNull().default(1),
    schemaVersion: integer("schema_version").notNull().default(1),
    actor: text("actor").notNull(),
    operationOrigin: text("operation_origin").notNull().default("aep"),
    payloadJson: text("payload_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("workflow_events_workflow_run_id_idx").on(table.workflowRunId),
    uniqueIndex("workflow_events_run_sequence_uidx").on(table.workflowRunId, table.sequence),
    index("workflow_events_actor_idx").on(table.actor),
    index("workflow_events_operation_origin_idx").on(table.operationOrigin),
  ],
);

export const approvals = sqliteTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    workflowRunId: text("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id),
    scope: text("scope").notNull(),
    decision: text("decision").notNull(),
    decidedBy: text("decided_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("approvals_workflow_run_id_idx").on(table.workflowRunId)],
);

export const gateExecutions = sqliteTable(
  "gate_executions",
  {
    id: text("id").primaryKey(),
    workflowRunId: text("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id),
    name: text("name").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("gate_executions_workflow_run_id_idx").on(table.workflowRunId)],
);

export const evidence = sqliteTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    workflowRunId: text("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id),
    source: text("source").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    summary: text("summary").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("evidence_workflow_run_id_idx").on(table.workflowRunId)],
);

export const reviewFindings = sqliteTable(
  "review_findings",
  {
    id: text("id").primaryKey(),
    workflowRunId: text("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id),
    severity: text("severity").notNull(),
    title: text("title").notNull(),
    assurance: text("assurance").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("review_findings_workflow_run_id_idx").on(table.workflowRunId)],
);

export const usageRecords = sqliteTable(
  "usage_records",
  {
    id: text("id").primaryKey(),
    workflowRunId: text("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id),
    roleExecutionId: text("role_execution_id")
      .notNull()
      .references(() => roleExecutions.id),
    costStatus: text("cost_status").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    /** Confirmed billed minor units only; never invent $0. */
    chargedAmountMinor: integer("charged_amount_minor"),
    currency: text("currency"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("usage_records_workflow_run_id_idx").on(table.workflowRunId),
    index("usage_records_role_execution_id_idx").on(table.roleExecutionId),
  ],
);

export const modelCatalogSnapshots = sqliteTable(
  "model_catalog_snapshots",
  {
    id: text("id").primaryKey(),
    capturedAt: text("captured_at").notNull(),
    /** JSON array of catalog entries without secrets. */
    modelsJson: text("models_json").notNull(),
    accountFingerprint: text("account_fingerprint"),
  },
  (table) => [index("model_catalog_snapshots_captured_at_idx").on(table.capturedAt)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const aepSchema = {
  projects,
  tasks,
  workflowRuns,
  roleExecutions,
  agentSessions,
  workspaces,
  workflowEvents,
  approvals,
  gateExecutions,
  evidence,
  reviewFindings,
  usageRecords,
  modelCatalogSnapshots,
  settings,
};
