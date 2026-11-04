-- AEP-020 initial schema. No secret/credential columns.
PRAGMA foreign_keys = ON;

CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  root_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  description TEXT NOT NULL,
  risk TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX tasks_project_id_idx ON tasks(project_id);

CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL,
  fix_cycle_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX workflow_runs_task_id_idx ON workflow_runs(task_id);
CREATE INDEX workflow_runs_project_id_idx ON workflow_runs(project_id);
CREATE INDEX workflow_runs_status_idx ON workflow_runs(status);

CREATE TABLE role_executions (
  id TEXT PRIMARY KEY NOT NULL,
  workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  role_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX role_executions_workflow_run_id_idx ON role_executions(workflow_run_id);

CREATE TABLE agent_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  role_execution_id TEXT NOT NULL REFERENCES role_executions(id),
  opaque_agent_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX agent_sessions_role_execution_id_idx ON agent_sessions(role_execution_id);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  branch_name TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  base_commit TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX workspaces_workflow_run_id_idx ON workspaces(workflow_run_id);

CREATE TABLE workflow_events (
  id TEXT PRIMARY KEY NOT NULL,
  workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL DEFAULT 1,
  schema_version INTEGER NOT NULL DEFAULT 1,
  actor TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX workflow_events_workflow_run_id_idx ON workflow_events(workflow_run_id);
CREATE UNIQUE INDEX workflow_events_run_sequence_uidx ON workflow_events(workflow_run_id, sequence);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY NOT NULL,
  workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  scope TEXT NOT NULL,
  decision TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX approvals_workflow_run_id_idx ON approvals(workflow_run_id);

CREATE TABLE gate_executions (
  id TEXT PRIMARY KEY NOT NULL,
  workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX gate_executions_workflow_run_id_idx ON gate_executions(workflow_run_id);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY NOT NULL,
  workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX evidence_workflow_run_id_idx ON evidence(workflow_run_id);

CREATE TABLE review_findings (
  id TEXT PRIMARY KEY NOT NULL,
  workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  assurance TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX review_findings_workflow_run_id_idx ON review_findings(workflow_run_id);

CREATE TABLE usage_records (
  id TEXT PRIMARY KEY NOT NULL,
  workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  role_execution_id TEXT NOT NULL REFERENCES role_executions(id),
  cost_status TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  charged_amount_minor INTEGER,
  currency TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX usage_records_workflow_run_id_idx ON usage_records(workflow_run_id);
CREATE INDEX usage_records_role_execution_id_idx ON usage_records(role_execution_id);

CREATE TABLE model_catalog_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  captured_at TEXT NOT NULL,
  models_json TEXT NOT NULL,
  account_fingerprint TEXT
);
CREATE INDEX model_catalog_snapshots_captured_at_idx ON model_catalog_snapshots(captured_at);

CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
