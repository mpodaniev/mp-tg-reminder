import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";
import { vi } from "vitest";
import { runMigrationsUp } from "../../src/infra/db/migrate.js";
import { SqliteReminderRepository } from "../../src/infra/db/sqlite-reminder-repository.js";
import { CaptureMessage } from "../../src/app/use-cases/capture-message.js";
import { ScheduleReminder } from "../../src/app/use-cases/schedule-reminder.js";
import { FireDueReminders } from "../../src/app/use-cases/fire-due-reminders.js";
import { ResolveReminder } from "../../src/app/use-cases/resolve-reminder.js";
import type { TelegramGateway } from "../../src/app/ports/telegram-gateway.js";
import { TelegramDeleteWindowError } from "../../src/app/ports/telegram-gateway.js";

const dbPath = join(tmpdir(), `test-e2e-${Date.now()}.db`);
const OWNER_ID = 123456789;
const OWNER_CHAT_ID = 777;

let db: Database.Database;
let repo: SqliteReminderRepository;

function makeFakeGateway(messageId = 100): TelegramGateway {
  return {
    sendReminder: vi.fn().mockResolvedValue({ messageId }),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editMessageToPlaceholder: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

beforeAll(() => {
  db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  runMigrationsUp(db);
  repo = new SqliteReminderRepository(db);
  db.prepare(
    `INSERT OR REPLACE INTO owner_settings (id, owner_telegram_id, timezone, created_at) VALUES (1, ?, 'Europe/Kyiv', ?)`
  ).run(OWNER_ID, Date.now());
});

afterAll(() => {
  db.close();
  try { unlinkSync(dbPath); } catch {}
});

describe("E2E: capture → fire → resolve journey", () => {
  it("full journey: capture → schedule → fire → done (AC-02, AC-04, AC-06)", async () => {
    const captureUC = new CaptureMessage(repo);
    const scheduleUC = new ScheduleReminder(repo);
    const gateway = makeFakeGateway(200);
    const fireUC = new FireDueReminders(repo, gateway, OWNER_CHAT_ID);
    const resolveUC = new ResolveReminder(repo);

    // 1. Capture
    const reminder = await captureUC.execute({
      senderTelegramId: OWNER_ID,
      snapshot: {
        chatId: 500,
        messageId: 600,
        chatUsername: null,
        senderName: null,
        senderUsername: null,
        messageText: "E2E test message",
        mediaFileId: null,
        mediaType: null,
        isMediaProtected: false,
      },
    });
    expect(reminder.state).toBe("awaiting_time");

    // 2. Schedule (past time to make it immediately fireable)
    const dueTime = Date.now() - 100;
    await scheduleUC.execute({ reminderId: reminder.id!, scheduledAtMs: dueTime + 1000 });

    // Force scheduled_at to past
    db.prepare("UPDATE reminders SET scheduled_at=? WHERE id=?").run(dueTime, reminder.id);

    // 3. Fire
    await fireUC.execute();

    const fired = await repo.findById(reminder.id!);
    expect(fired!.state).toBe("fired");
    expect(fired!.deliveredAt).not.toBeNull();
    expect(fired!.firedMessageId).toBe(200);

    // 4. Resolve done
    const resolved = await resolveUC.execute({ reminderId: reminder.id!, action: "done" });
    expect(resolved.state).toBe("done");
  });

  it("full journey: capture → schedule → fire → snooze → fire again (AC-05)", async () => {
    const captureUC = new CaptureMessage(repo);
    const scheduleUC = new ScheduleReminder(repo);
    const gateway = makeFakeGateway(300);
    const fireUC = new FireDueReminders(repo, gateway, OWNER_CHAT_ID);
    const { SnoozeReminder } = await import("../../src/app/use-cases/snooze-reminder.js");
    const snoozeUC = new SnoozeReminder(repo);

    const reminder = await captureUC.execute({
      senderTelegramId: OWNER_ID,
      snapshot: {
        chatId: 501,
        messageId: 601,
        chatUsername: null,
        senderName: null,
        senderUsername: null,
        messageText: "Snooze E2E",
        mediaFileId: null,
        mediaType: null,
        isMediaProtected: false,
      },
    });

    const dueTime = Date.now() - 100;
    await scheduleUC.execute({ reminderId: reminder.id!, scheduledAtMs: dueTime + 500 });
    db.prepare("UPDATE reminders SET scheduled_at=? WHERE id=?").run(dueTime, reminder.id);

    await fireUC.execute();
    let r = await repo.findById(reminder.id!);
    expect(r!.state).toBe("fired");

    // Snooze
    const newTime = Date.now() - 50;
    await snoozeUC.execute({ reminderId: reminder.id!, newScheduledAtMs: newTime + 500 });
    db.prepare("UPDATE reminders SET scheduled_at=? WHERE id=?").run(newTime, reminder.id);

    r = await repo.findById(reminder.id!);
    expect(r!.state).toBe("pending");

    // Fire again
    const gateway2 = makeFakeGateway(301);
    const fireUC2 = new FireDueReminders(repo, gateway2, OWNER_CHAT_ID);
    await fireUC2.execute();

    r = await repo.findById(reminder.id!);
    expect(r!.state).toBe("fired");
  });
});
