import Database from "better-sqlite3";
import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "../../../migrations");

function ensureTrackingTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);
}

function appliedMigrations(db: Database.Database): Set<string> {
  ensureTrackingTable(db);
  const rows = db.prepare("SELECT name FROM _migrations").all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

export function runMigrationsUp(db: Database.Database): void {
  db.pragma("foreign_keys = ON");
  ensureTrackingTable(db);
  const applied = appliedMigrations(db);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".up.sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    db.exec(sql);
    db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(
      file,
      Date.now()
    );
  }
}

export function runMigrationsDown(db: Database.Database): void {
  db.pragma("foreign_keys = ON");
  ensureTrackingTable(db);
  const applied = appliedMigrations(db);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".down.sql"))
    .sort()
    .reverse();

  for (const file of files) {
    const upName = file.replace(".down.sql", ".up.sql");
    if (!applied.has(upName)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    db.exec(sql);
    db.prepare("DELETE FROM _migrations WHERE name = ?").run(upName);
  }
}

if (process.argv[2] === "up" || process.argv[2] === "down") {
  const dbPath = process.env["DB_PATH"] ?? "./data/reminders.db";
  const db = new Database(dbPath);
  if (process.argv[2] === "up") runMigrationsUp(db);
  else runMigrationsDown(db);
  db.close();
}
