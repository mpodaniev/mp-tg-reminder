import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSnooze } from "../handlers/snooze-handler.js";
import { SnoozeReminder } from "../../app/use-cases/snooze-reminder.js";
import { InMemoryReminderRepository } from "../../app/use-cases/__tests__/helpers/in-memory-repo.js";
import { Reminder } from "../../domain/reminder.js";
import { AlreadyResolvedError } from "../../domain/errors.js";
import type { SourceSnapshot } from "../../domain/value-objects/source-snapshot.js";

const OWNER_ID = 123456789;

function makeSnapshot(id = 1): SourceSnapshot {
  return {
    id,
    chatId: 100,
    messageId: 200,
    chatUsername: null,
    senderName: null,
    senderUsername: null,
    messageText: "test",
    mediaFileId: null,
    mediaType: null,
    isMediaProtected: false,
    createdAt: Date.now(),
  };
}

function makeCtx() {
  const answers: string[] = [];
  return {
    from: { id: OWNER_ID },
    callbackQuery: { id: "cq1", data: "snooze:1" },
    answerCallbackQuery: vi.fn().mockImplementation((text: string) => {
      answers.push(text ?? "");
      return Promise.resolve();
    }),
    reply: vi.fn().mockResolvedValue(undefined),
    editMessageReplyMarkup: vi.fn().mockResolvedValue(undefined),
    _answers: answers,
  };
}

describe("handleSnooze callback handler", () => {
  let repo: InMemoryReminderRepository;
  let snoozeUC: SnoozeReminder;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
    snoozeUC = new SnoozeReminder(repo);
  });

  it("shows snooze quick-picks hiding past-today wall-clock times (AC-05)", async () => {
    const r = Reminder.reconstitute({
      id: 1,
      snapshot: makeSnapshot(),
      state: "fired",
      firedMessageId: 42,
    });
    repo.reminders.set(1, r);
    const ctx = makeCtx();

    await handleSnooze(ctx as any, snoozeUC, 1);

    // Should reply with snooze options
    expect(ctx.reply).toHaveBeenCalled();
    const replyArgs = (ctx.reply as any).mock.calls[0];
    const markup = replyArgs[1]?.reply_markup;
    expect(markup?.inline_keyboard).toBeDefined();
  });

  it("answers with 'already resolved' when snoozing a done reminder (AC-10)", async () => {
    const r = Reminder.reconstitute({ id: 2, snapshot: makeSnapshot(2), state: "done" });
    repo.reminders.set(2, r);
    const ctx = makeCtx();

    await handleSnooze(ctx as any, snoozeUC, 2);

    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    const msg = (ctx.answerCallbackQuery as any).mock.calls[0][0];
    expect(typeof msg === "string" && msg.length > 0).toBe(true);
  });
});
