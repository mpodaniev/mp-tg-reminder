import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";
import { vi } from "vitest";
import { runMigrationsUp } from "../../src/infra/db/migrate.js";
import { SqliteReminderRepository } from "../../src/infra/db/sqlite-reminder-repository.js";
import { FireDueReminders } from "../../src/app/use-cases/fire-due-reminders.js";
import { Reminder } from "../../src/domain/reminder.js";
import type { TelegramGateway } from "../../src/app/ports/telegram-gateway.js";
import type { SourceSnapshot } from "../../src/domain/value-objects/source-snapshot.js";

const dbPath = join(tmpdir(), `test-durability-${Date.now()}.db`);
const OWNER_CHAT_ID = 777;

let db: Database.Database;
let repo: SqliteReminderRepository;

function makeFakeGateway(): TelegramGateway {
  return {
    sendReminder: vi.fn().mockResolvedValue({ messageId: 99 }),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editMessageToPlaceholder: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

beforeAll(() => {
  db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  runMigrationsUp(db);
  repo = new SqliteReminderRepository(db);
  db.prepare(
    `INSERT OR REPLACE INTO owner_settings (id, owner_telegram_id, timezone, created_at) VALUES (1, 123456789, 'Europe/Kyiv', ?)`
  ).run(Date.now());
});

afterAll(() => {
  db.close();
  try { unlinkSync(dbPath); } catch {}
});

function makeSnapshot(id: number): SourceSnapshot {
  return {
    id,
    chatId: 100,
    messageId: 200 + id,
    chatUsername: null,
    senderName: null,
    senderUsername: null,
    messageText: `durability test ${id}`,
    mediaFileId: null,
    mediaType: null,
    isMediaProtected: false,
    createdAt: Date.now(),
  };
}

describe("Durability: restart simulation", () => {
  it("firing-state reminder is re-fired after simulated crash (ADR-0005)", async () => {
    const snapshotData = {
      chatId: 100,
      messageId: 300,
      chatUsername: null,
      senderName: null,
      senderUsername: null,
      messageText: "crash test",
      mediaFileId: null,
      mediaType: null,
      isMediaProtected: false,
      createdAt: Date.now(),
    };
    const r = Reminder.create({ snapshot: { ...snapshotData, id: 0 } });
    const saved = await repo.saveWithSnapshot(snapshotData, r);

    // Manually set to firing (simulates crash mid-fire)
    db.prepare("UPDATE reminders SET state='firing', scheduled_at=? WHERE id=?")
      .run(Date.now() - 1000, saved.id);

    const gateway = makeFakeGateway();
    const fireUC = new FireDueReminders(repo, gateway, OWNER_CHAT_ID);

    await fireUC.execute();

    const updated = await repo.findById(saved.id!);
    expect(updated!.state).toBe("fired");
    expect(updated!.deliveredAt).not.toBeNull();
    expect(gateway.sendReminder).toHaveBeenCalledOnce();
  });

  it("already-fired reminder (delivered_at set) is not re-fired", async () => {
    const snapshotData = {
      chatId: 101,
      messageId: 301,
      chatUsername: null,
      senderName: null,
      senderUsername: null,
      messageText: "already fired",
      mediaFileId: null,
      mediaType: null,
      isMediaProtected: false,
      createdAt: Date.now(),
    };
    const r = Reminder.create({ snapshot: { ...snapshotData, id: 0 } });
    const saved = await repo.saveWithSnapshot(snapshotData, r);

    db.prepare(
      "UPDATE reminders SET state='fired', scheduled_at=?, delivered_at=?, fired_message_id=99 WHERE id=?"
    ).run(Date.now() - 1000, Date.now() - 500, saved.id);

    const gateway = makeFakeGateway();
    const fireUC = new FireDueReminders(repo, gateway, OWNER_CHAT_ID);

    await fireUC.execute();

    expect(gateway.sendReminder).not.toHaveBeenCalled();
  });
});
