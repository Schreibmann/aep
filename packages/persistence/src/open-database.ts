import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "./migrate.ts";
import { aepSchema } from "./schema.ts";

export type OpenDatabaseOptions = {
  readonly readonly?: boolean;
  readonly migrate?: boolean;
};

export type AepDatabase = {
  readonly sqlite: Database.Database;
  readonly db: ReturnType<typeof drizzle<typeof aepSchema>>;
  readonly path: string;
  close(): void;
};

function applyPragmas(sqlite: Database.Database): void {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
}

/**
 * Opens AEP SQLite DB with WAL, foreign keys, busy timeout, and migrations.
 * Cursor SDK local session store is not opened here.
 */
export function openDatabase(dbPath: string, options: OpenDatabaseOptions = {}): AepDatabase {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath, {
    readonly: options.readonly === true,
    fileMustExist: options.readonly === true,
  });
  applyPragmas(sqlite);

  if (options.migrate !== false && options.readonly !== true) {
    migrate(sqlite);
  }

  const db = drizzle(sqlite, { schema: aepSchema });
  return {
    sqlite,
    db,
    path: dbPath,
    close: () => {
      sqlite.close();
    },
  };
}
