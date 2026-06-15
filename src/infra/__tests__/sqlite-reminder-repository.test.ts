import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";
import { runMigrationsUp } from "../db/migrate.js";
import { SqliteReminderRepository } from "../db/sqlite-reminder-repository.js";
import { Reminder } from "../../domain/reminder.js";
import { buildOwnerSettings, buildSourceSnapshot } from "../../../test/helpers/factories.js";

const dbPath = join(tmpdir(), `test-repo-${Date.now()}.db`);
let db: Database.Database;
let repo: SqliteReminderRepository;

beforeAll(() => {
  db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  runMigrationsUp(db);
  repo = new SqliteReminderRepository(db);

  const settings = buildOwnerSettings();
  db.prepare(
    `INSERT OR REPLACE INTO owner_settings (id, owner_telegram_id, timezone, created_at)
     VALUES (1, ?, ?, ?)`
  ).run(settings.owner_telegram_id, settings.timezone, settings.created_at);
});

afterAll(() => {
  db.close();
  try { unlinkSync(dbPath); } catch {}
});

describe("SqliteReminderRepository", () => {
  it("saveWithSnapshot creates both rows atomically and returns a Reminder with id", async () => {
    const snapshotData = {
      chatId: 100,
      messageId: 200,
      chatUsername: "testchat" as string | null,
      senderName: "Alice" as string | null,
      senderUsername: "alice" as string | null,
      messageText: "Hello" as string | null,
      mediaFileId: null as string | null,
      mediaType: null as string | null,
      isMediaProtected: false,
      createdAt: Date.now(),
    };
    const r = Reminder.create({ snapshot: { ...snapshotData, id: 0 } });
    const saved = await repo.saveWithSnapshot(snapshotData, r);

    expect(saved.id).toBeDefined();
    expect(saved.id).toBeGreaterThan(0);
    expect(saved.state).toBe("awaiting_time");
  });

  it("findById returns the saved reminder", async () => {
    const snapshotData = {
      chatId: 101,
      messageId: 201,
      chatUsername: null,
      senderName: null,
      senderUsername: null,
      messageText: "find me",
      mediaFileId: null,
      mediaType: null,
      isMediaProtected: false,
      createdAt: Date.now(),
    };
    const r = Reminder.create({ snapshot: { ...snapshotData, id: 0 } });
    const saved = await repo.saveWithSnapshot(snapshotData, r);

    const found = await repo.findById(saved.id!);
    expect(found).not.toBeNull();
    expect(found!.snapshot.messageText).toBe("find me");
  });

  it("findDuePending returns only past-due pending reminders", async () => {
    const snapshotData = {
      chatId: 102,
      messageId: 202,
      chatUsername: null,
      senderName: null,
      senderUsername: null,
      messageText: "due",
      mediaFileId: null,
      mediaType: null,
      isMediaProtected: false,
      createdAt: Date.now(),
    };
    const r = Reminder.create({ snapshot: { ...snapshotData, id: 0 } });
    const saved = await repo.saveWithSnapshot(snapshotData, r);

    // schedule it in the past
    const past = Date.now() - 1000;
    db.prepare("UPDATE reminders SET state='pending', scheduled_at=? WHERE id=?").run(past, saved.id);

    const due = await repo.findDuePending(Date.now());
    const ids = due.map((x) => x.id);
    expect(ids).toContain(saved.id);
  });

  it("update persists state change", async () => {
    const snapshotData = {
      chatId: 103,
      messageId: 203,
      chatUsername: null,
      senderName: null,
      senderUsername: null,
      messageText: "update me",
      mediaFileId: null,
      mediaType: null,
      isMediaProtected: false,
      createdAt: Date.now(),
    };
    const r = Reminder.create({ snapshot: { ...snapshotData, id: 0 } });
    const saved = await repo.saveWithSnapshot(snapshotData, r);

    // manually schedule it first
    db.prepare("UPDATE reminders SET state='pending', scheduled_at=? WHERE id=?")
      .run(Date.now() - 1000, saved.id);

    const reloaded = await repo.findById(saved.id!);
    reloaded!.startFiring();
    await repo.update(reloaded!);

    const updated = await repo.findById(saved.id!);
    expect(updated!.state).toBe("firing");
  });

  it("getOwnerSettings returns the seeded row", async () => {
    const settings = await repo.getOwnerSettings();
    expect(settings).not.toBeNull();
    expect(settings!.ownerTelegramId).toBe(123456789);
    expect(settings!.timezone).toBe("Europe/Kyiv");
  });
});

describe("SqliteReminderRepository.findActivePendingOrdered (T3, AC-01)", () => {
  let memDb: Database.Database;
  let memRepo: SqliteReminderRepository;

  function seedReminder(state: string, scheduledAt: number | null): number {
    const snapId = memDb
      .prepare(
        `INSERT INTO source_snapshots
         (chat_id, message_id, chat_username, sender_name, sender_username,
          message_text, media_file_id, media_type, is_media_protected, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(100, 200, null, null, null, "text", null, null, 0, 1000)
      .lastInsertRowid as number;
    return memDb
      .prepare(
        `INSERT INTO reminders (snapshot_id, state, scheduled_at, fired_at, delivered_at, fired_message_id, created_at)
         VALUES (?, ?, ?, NULL, NULL, NULL, ?)`
      )
      .run(snapId, state, scheduledAt, 1000)
      .lastInsertRowid as number;
  }

  beforeEach(() => {
    memDb = new Database(":memory:");
    memDb.pragma("foreign_keys = ON");
    runMigrationsUp(memDb);
    memRepo = new SqliteReminderRepository(memDb);
  });

  afterEach(() => memDb.close());

  it("returns only pending reminders ordered by scheduled_at ascending", async () => {
    const c = seedReminder("pending", 3000);
    const a = seedReminder("pending", 1000);
    const b = seedReminder("pending", 2000);
    seedReminder("fired", 1500);
    seedReminder("deleted", 500);

    const result = await memRepo.findActivePendingOrdered();

    expect(result.map((r) => r.id)).toEqual([a, b, c]);
    expect(result.every((r) => r.state === "pending")).toBe(true);
  });

  it("tie-breaks equal scheduled_at by capture order (id ascending)", async () => {
    const first = seedReminder("pending", 5000);
    const second = seedReminder("pending", 5000);
    const third = seedReminder("pending", 5000);

    const result = await memRepo.findActivePendingOrdered();

    expect(result.map((r) => r.id)).toEqual([first, second, third]);
  });

  it("returns an empty array when there are no pending reminders", async () => {
    seedReminder("fired", 1000);
    expect(await memRepo.findActivePendingOrdered()).toEqual([]);
  });

  it("uses idx_reminders_state_scheduled_at for the read", () => {
    seedReminder("pending", 1000);
    const plan = memDb
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT r.* FROM reminders r WHERE r.state = 'pending' ORDER BY r.scheduled_at ASC, r.id ASC`
      )
      .all() as Array<{ detail: string }>;
    const detail = plan.map((p) => p.detail).join(" ");
    expect(detail).toContain("idx_reminders_state_scheduled_at");
  });
});
