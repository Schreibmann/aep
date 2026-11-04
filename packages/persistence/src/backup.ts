import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type Database from "better-sqlite3";

export type BackupResult = {
  readonly sourcePath: string;
  readonly destinationPath: string;
};

/**
 * Creates a consistent local backup of the AEP SQLite database.
 * Uses better-sqlite3 backup API (async completion).
 */
export async function backupDatabase(
  sqlite: Database.Database,
  destinationPath: string,
): Promise<BackupResult> {
  mkdirSync(dirname(destinationPath), { recursive: true });
  await sqlite.backup(destinationPath);
  return {
    sourcePath: sqlite.name,
    destinationPath,
  };
}

export function exportDatabaseFile(sourcePath: string, destinationPath: string): BackupResult {
  if (!existsSync(sourcePath)) {
    throw new Error(`Source database not found: ${sourcePath}`);
  }
  mkdirSync(dirname(destinationPath), { recursive: true });
  copyFileSync(sourcePath, destinationPath);
  return {
    sourcePath,
    destinationPath,
  };
}
