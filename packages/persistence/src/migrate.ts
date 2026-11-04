import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

const MIGRATIONS_TABLE = "aep_schema_migrations";

export type AppliedMigration = {
  readonly id: string;
  readonly appliedAt: string;
};

function migrationsDirectory(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "migrations");
}

function listMigrationFiles(): ReadonlyArray<{ id: string; path: string }> {
  const dir = migrationsDirectory();
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      id: name.replace(/\.sql$/u, ""),
      path: join(dir, name),
    }));
}

function ensureMigrationsTable(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function isAppliedRow(value: unknown): value is { id: string; appliedAt: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "appliedAt" in value &&
    typeof value.id === "string" &&
    typeof value.appliedAt === "string"
  );
}

export function listAppliedMigrations(sqlite: Database.Database): ReadonlyArray<AppliedMigration> {
  ensureMigrationsTable(sqlite);
  const rows = sqlite
    .prepare(`SELECT id, applied_at AS appliedAt FROM ${MIGRATIONS_TABLE} ORDER BY id ASC`)
    .all();
  const result: AppliedMigration[] = [];
  for (const row of rows) {
    if (!isAppliedRow(row)) {
      throw new Error("Invalid row in aep_schema_migrations");
    }
    result.push({ id: row.id, appliedAt: row.appliedAt });
  }
  return result;
}

/**
 * Applies pending SQL migrations idempotently.
 * Safe on clean and existing databases.
 */
export function migrate(
  sqlite: Database.Database,
  now: () => string = () => new Date().toISOString(),
): ReadonlyArray<string> {
  ensureMigrationsTable(sqlite);
  const applied = new Set(listAppliedMigrations(sqlite).map((row) => row.id));
  const appliedNow: string[] = [];

  for (const migration of listMigrationFiles()) {
    if (applied.has(migration.id)) {
      continue;
    }
    const sql = readFileSync(migration.path, "utf8");
    const apply = sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite
        .prepare(`INSERT INTO ${MIGRATIONS_TABLE} (id, applied_at) VALUES (?, ?)`)
        .run(migration.id, now());
    });
    apply();
    appliedNow.push(migration.id);
  }

  return appliedNow;
}
