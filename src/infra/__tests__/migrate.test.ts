import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { runMigrationsUp, runMigrationsDown } from "../db/migrate.js";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";

const dbPath = join(tmpdir(), `test-migrate-${Date.now()}.db`);
let db: Database.Database;

beforeAll(() => {
  db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
});

afterAll(() => {
  db.close();
  try { unlinkSync(dbPath); } catch {}
});

describe("migration runner", () => {
  it("applies all 4 up-migrations cleanly", () => {
    runMigrationsUp(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("owner_settings");
    expect(names).toContain("source_snapshots");
    expect(names).toContain("reminders");
    expect(names).toContain("pending_prompt");
    expect(names).toContain("_migrations");
  });

  it("PRAGMA foreign_keys is ON", () => {
    const fk = db.pragma("foreign_keys", { simple: true }) as number;
    expect(fk).toBe(1);
  });

  it("is idempotent — running up twice does not throw", () => {
    expect(() => runMigrationsUp(db)).not.toThrow();
  });

  it("rolls back all 3 down-migrations cleanly", () => {
    runMigrationsDown(db);
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('_migrations','sqlite_sequence')"
      )
      .all() as { name: string }[];
    expect(tables).toHaveLength(0);
  });

  it("re-applies after rollback", () => {
    runMigrationsUp(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("reminders");
  });
});
