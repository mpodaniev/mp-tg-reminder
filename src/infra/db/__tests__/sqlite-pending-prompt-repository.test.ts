import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";
import { runMigrationsUp } from "../migrate.js";
import { SqlitePendingPromptRepository } from "../sqlite-pending-prompt-repository.js";

describe("SqlitePendingPromptRepository", () => {
  let db: Database.Database;
  let repo: SqlitePendingPromptRepository;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-pending-prompt-${Date.now()}-${Math.random()}.db`);
    db = new Database(dbPath);
    runMigrationsUp(db);
    // pending_prompt.reminder_id has a FK to reminders(id); seed one row to reference.
    db.prepare(
      `INSERT INTO source_snapshots (chat_id, message_id, chat_username, sender_name,
        sender_username, message_text, media_file_id, media_type, is_media_protected, created_at)
       VALUES (1, 1, NULL, NULL, NULL, 'x', NULL, NULL, 0, ?)`
    ).run(Date.now());
    db.prepare(
      `INSERT INTO reminders (snapshot_id, state, scheduled_at, fired_at, delivered_at, fired_message_id, created_at)
       VALUES (1, 'awaiting_time', NULL, NULL, NULL, NULL, ?)`
    ).run(Date.now());
    repo = new SqlitePendingPromptRepository(db);
  });

  afterEach(() => {
    db.close();
    try { unlinkSync(dbPath); } catch {}
  });

  it("returns null when no pending prompt is set", async () => {
    const found = await repo.findPendingPrompt();
    expect(found).toBeNull();
  });

  it("saves and finds a pending prompt", async () => {
    const createdAt = Date.now();
    await repo.savePendingPrompt({ type: "capture", reminderId: 1, createdAt });

    const found = await repo.findPendingPrompt();
    expect(found).toEqual({ type: "capture", reminderId: 1, createdAt });
  });

  it("upserts on id=1 — saving again replaces the previous pending prompt", async () => {
    await repo.savePendingPrompt({ type: "capture", reminderId: 1, createdAt: 1 });
    await repo.savePendingPrompt({ type: "snooze", reminderId: 1, createdAt: 2 });

    const found = await repo.findPendingPrompt();
    expect(found).toEqual({ type: "snooze", reminderId: 1, createdAt: 2 });

    const rows = db.prepare("SELECT COUNT(*) as n FROM pending_prompt").get() as { n: number };
    expect(rows.n).toBe(1);
  });

  it("clearing deletes the row — findPendingPrompt then returns null (delete-means-absent)", async () => {
    await repo.savePendingPrompt({ type: "capture", reminderId: 1, createdAt: Date.now() });
    await repo.clearPendingPrompt();

    const found = await repo.findPendingPrompt();
    expect(found).toBeNull();

    const rows = db.prepare("SELECT COUNT(*) as n FROM pending_prompt").get() as { n: number };
    expect(rows.n).toBe(0);
  });
});
