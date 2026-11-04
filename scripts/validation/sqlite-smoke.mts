/**
 * AEP-002 SQLite driver smoke: Drizzle + better-sqlite3 on the current Node/OS.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const probes = sqliteTable("probes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
});

const dir = await mkdtemp(join(tmpdir(), "aep-sqlite-"));
const dbPath = join(dir, "smoke.sqlite");

try {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE probes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL
    );
  `);

  const db = drizzle(sqlite);
  db.insert(probes).values({ label: "aep-002" }).run();
  const rows = db.select().from(probes).where(eq(probes.label, "aep-002")).all();
  if (rows.length !== 1) {
    throw new Error(`expected 1 row, got ${rows.length}`);
  }

  sqlite.close();
  console.log(
    JSON.stringify({
      ok: true,
      driver: "better-sqlite3",
      orm: "drizzle-orm/better-sqlite3",
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      wal: true,
      foreignKeys: true,
    }),
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
