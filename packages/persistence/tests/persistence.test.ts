import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  backupDatabase,
  insertModelCatalogSnapshot,
  insertUsageRecord,
  listAppliedMigrations,
  listUsageRecordsForRun,
  openDatabase,
  projects,
  seedRoleExecution,
  seedWorkflowRun,
  tasks,
} from "../src/index.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

async function tempDbPath(label: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `aep-db-${label}-`));
  tempDirs.push(dir);
  return join(dir, "aep.sqlite");
}

function tableNames(sqlite: import("better-sqlite3").Database): string[] {
  const rows = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all();
  const names: string[] = [];
  for (const row of rows) {
    if (typeof row === "object" && row !== null && "name" in row && typeof row.name === "string") {
      names.push(row.name);
    }
  }
  return names;
}

function indexNames(sqlite: import("better-sqlite3").Database): string[] {
  const rows = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'`)
    .all();
  const names: string[] = [];
  for (const row of rows) {
    if (typeof row === "object" && row !== null && "name" in row && typeof row.name === "string") {
      names.push(row.name);
    }
  }
  return names;
}

function columnNames(sqlite: import("better-sqlite3").Database, table: string): string[] {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all();
  const names: string[] = [];
  for (const row of rows) {
    if (typeof row === "object" && row !== null && "name" in row && typeof row.name === "string") {
      names.push(row.name);
    }
  }
  return names;
}

describe("@aep/persistence", () => {
  it("migrates a clean database and is idempotent on reopen", async () => {
    const path = await tempDbPath("clean");
    const first = openDatabase(path);
    const appliedFirst = listAppliedMigrations(first.sqlite).map((row) => row.id);
    expect(appliedFirst).toContain("0001_init");

    const tables = tableNames(first.sqlite);
    expect(tables).toEqual(
      expect.arrayContaining([
        "projects",
        "tasks",
        "workflow_runs",
        "role_executions",
        "agent_sessions",
        "workspaces",
        "workflow_events",
        "approvals",
        "gate_executions",
        "evidence",
        "review_findings",
        "usage_records",
        "model_catalog_snapshots",
        "settings",
        "aep_schema_migrations",
      ]),
    );

    first.close();

    const second = openDatabase(path);
    expect(listAppliedMigrations(second.sqlite).map((row) => row.id)).toEqual(appliedFirst);
    second.close();
  });

  it("enforces foreign keys and exposes expected indexes", async () => {
    const path = await tempDbPath("fk");
    const opened = openDatabase(path);
    const { sqlite, db } = opened;

    expect(() =>
      db
        .insert(tasks)
        .values({
          id: "task_1",
          projectId: "missing_project",
          description: "x",
          risk: "low",
          createdAt: "2026-11-05T00:00:00.000Z",
        })
        .run(),
    ).toThrow(/FOREIGN KEY/i);

    db.insert(projects)
      .values({
        id: "proj_1",
        rootPath: "/tmp/aep",
        createdAt: "2026-11-05T00:00:00.000Z",
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task_1",
        projectId: "proj_1",
        description: "ok",
        risk: "medium",
        createdAt: "2026-11-05T00:00:00.000Z",
      })
      .run();

    const indexes = indexNames(sqlite);
    expect(indexes).toEqual(
      expect.arrayContaining([
        "tasks_project_id_idx",
        "workflow_runs_status_idx",
        "workflow_events_run_sequence_uidx",
        "usage_records_role_execution_id_idx",
      ]),
    );

    opened.close();
  });

  it("backs up an open database to another path", async () => {
    const path = await tempDbPath("backup-src");
    const opened = openDatabase(path);
    opened.db
      .insert(projects)
      .values({
        id: "proj_backup",
        rootPath: "/tmp/backup",
        createdAt: "2026-11-05T00:00:00.000Z",
      })
      .run();

    const dest = join(tempDirs[0] ?? tmpdir(), "backup.sqlite");
    const result = await backupDatabase(opened.sqlite, dest);
    expect(result.destinationPath).toBe(dest);

    opened.close();

    const restored = openDatabase(dest, { migrate: false });
    const rows = restored.db.select().from(projects).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("proj_backup");
    restored.close();
  });

  it("persists usage without inventing $0 and stores catalog snapshots", async () => {
    const path = await tempDbPath("usage");
    const opened = openDatabase(path);
    const at = "2026-11-05T16:00:00.000Z";
    seedWorkflowRun(opened, {
      projectId: "proj_u",
      taskId: "task_u",
      runId: "run_u",
      rootPath: "/tmp/aep",
      description: "usage",
      risk: "low",
      createdAt: at,
    });
    seedRoleExecution(opened, {
      id: "role_u",
      workflowRunId: "run_u",
      roleId: "planner",
      status: "running",
      attempt: 1,
      createdAt: at,
    });
    insertUsageRecord(opened, {
      id: "usage_u",
      workflowRunId: "run_u",
      roleExecutionId: "role_u",
      costStatus: "unknown",
      inputTokens: 11,
      outputTokens: 7,
      createdAt: at,
    });
    const listed = listUsageRecordsForRun(opened, "run_u");
    expect(listed).toHaveLength(1);
    expect(listed[0]?.costStatus).toBe("unknown");
    expect(listed[0]?.chargedAmountMinor).toBeNull();
    expect(listed[0]?.inputTokens).toBe(11);

    insertModelCatalogSnapshot(opened, {
      snapshot: {
        snapshotId: "snap_u",
        capturedAt: at,
        models: [{ id: "m1", label: "M1", billingCategory: "unknown" }],
      },
    });
    opened.close();
  });

  it("does not define secret-bearing column names", async () => {
    const path = await tempDbPath("nosecrets");
    const opened = openDatabase(path);
    const forbiddenExact = new Set([
      "api_key",
      "apikey",
      "secret",
      "password",
      "token",
      "access_token",
      "refresh_token",
      "credential",
      "credentials",
      "private_key",
      "cursor_api_key",
    ]);
    const tables = tableNames(opened.sqlite).filter((name) => name !== "aep_schema_migrations");
    for (const table of tables) {
      for (const column of columnNames(opened.sqlite, table)) {
        expect(forbiddenExact.has(column.toLowerCase())).toBe(false);
      }
    }
    opened.close();
  });
});
