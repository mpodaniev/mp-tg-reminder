import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { runMigrationsUp } from "../../infra/db/migrate.js";
import { SqliteReminderRepository } from "../../infra/db/sqlite-reminder-repository.js";
import { CancelPendingReminder } from "../../app/use-cases/cancel-pending-reminder.js";
import { handleSource } from "../handlers/source-handler.js";
import { InvalidStateTransitionError } from "../../domain/errors.js";
import type { ReminderState } from "../../domain/state-machine.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";

// The spec Test plan §Integration strategy mandates a throwaway REAL
// better-sqlite3 for the cancel-persist (AC-03/04) and source-JOIN (AC-06)
// flows — "a passing mock is not a passing production". These cases exercise
// the real UPDATE and the real reminders⨝source_snapshots JOIN that the
// in-memory fake never touches (review finding #1).

const OWNER_ID = 123456789;

let db: Database.Database;
let repo: SqliteReminderRepository;

function seedReminder(
  state: string,
  opts: {
    scheduledAt?: number | null;
    chatUsername?: string | null;
    messageId?: number;
    messageText?: string | null;
  } = {}
): number {
  const snapId = db
    .prepare(
      `INSERT INTO source_snapshots
       (chat_id, message_id, chat_username, sender_name, sender_username,
        message_text, media_file_id, media_type, is_media_protected, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      100,
      opts.messageId ?? 200,
      opts.chatUsername ?? null,
      null,
      null,
      opts.messageText ?? "body",
      null,
      null,
      0,
      1000
    ).lastInsertRowid as number;
  return db
    .prepare(
      `INSERT INTO reminders (snapshot_id, state, scheduled_at, fired_at, delivered_at, fired_message_id, created_at)
       VALUES (?, ?, ?, NULL, NULL, NULL, ?)`
    )
    .run(snapId, state, opts.scheduledAt ?? null, 1000).lastInsertRowid as number;
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrationsUp(db);
  repo = new SqliteReminderRepository(db);
});

afterEach(() => db.close());

describe("cancel persists against real SQLite (AC-03 / AC-04)", () => {
  it("transitions pending→deleted and persists the change to the real DB (AC-03)", async () => {
    const id = seedReminder("pending", { scheduledAt: Date.now() + 60_000 });
    const useCase = new CancelPendingReminder(repo);

    await useCase.execute({ reminderId: id });

    const row = db.prepare("SELECT state FROM reminders WHERE id = ?").get(id) as {
      state: string;
    };
    expect(row.state).toBe("deleted");
  });

  it.each<ReminderState>(["firing", "fired", "done", "deleted", "expired"])(
    "rejects cancel from non-pending '%s' and leaves the real row unchanged (AC-04)",
    async (state) => {
      const id = seedReminder(state);
      const useCase = new CancelPendingReminder(repo);

      await expect(useCase.execute({ reminderId: id })).rejects.toBeInstanceOf(
        InvalidStateTransitionError
      );

      const row = db.prepare("SELECT state FROM reminders WHERE id = ?").get(id) as {
        state: string;
      };
      expect(row.state).toBe(state);
    }
  );
});

describe("go-to-source reads the reminder⨝snapshot JOIN from real SQLite (AC-06)", () => {
  function makeGateway(): TelegramGateway {
    return {
      sendReminder: vi.fn().mockResolvedValue({ messageId: 1 }),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
      editMessageToPlaceholder: vi.fn().mockResolvedValue(undefined),
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };
  }

  const makeCtx = () => ({ answerCallbackQuery: vi.fn().mockResolvedValue(undefined) });

  it("builds a deep link when the joined snapshot has a public username (AC-06)", async () => {
    const id = seedReminder("pending", {
      scheduledAt: Date.now() + 1000,
      chatUsername: "publicchat",
      messageId: 555,
    });
    const gateway = makeGateway();

    await handleSource(makeCtx() as any, repo, gateway, id, OWNER_ID);

    const [, text] = (gateway.sendMessage as any).mock.calls[0];
    expect(text).toContain("t.me/publicchat/555");
  });

  it("falls back to inline content when the joined snapshot has no public username (AC-06)", async () => {
    const id = seedReminder("pending", {
      scheduledAt: Date.now() + 1000,
      chatUsername: null,
      messageText: "private body",
    });
    const gateway = makeGateway();

    await handleSource(makeCtx() as any, repo, gateway, id, OWNER_ID);

    const [, text] = (gateway.sendMessage as any).mock.calls[0];
    expect(text).toContain("private body");
  });
});
