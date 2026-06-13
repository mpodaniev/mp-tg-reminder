import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleResolve } from "../handlers/resolve-handler.js";
import { ResolveReminder } from "../../app/use-cases/resolve-reminder.js";
import { InMemoryReminderRepository } from "../../app/use-cases/__tests__/helpers/in-memory-repo.js";
import { Reminder } from "../../domain/reminder.js";
import { TelegramDeleteWindowError } from "../../app/ports/telegram-gateway.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";
import type { SourceSnapshot } from "../../domain/value-objects/source-snapshot.js";

const OWNER_ID = 123456789;
const CHAT_ID = 777;

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

function makeFakeGateway(deleteThrows = false): TelegramGateway {
  return {
    sendReminder: vi.fn().mockResolvedValue({ messageId: 1 }),
    deleteMessage: deleteThrows
      ? vi.fn().mockRejectedValue(new TelegramDeleteWindowError())
      : vi.fn().mockResolvedValue(undefined),
    editMessageToPlaceholder: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

describe("handleResolve callback handler", () => {
  let repo: InMemoryReminderRepository;
  let resolveUC: ResolveReminder;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
    resolveUC = new ResolveReminder(repo);
  });

  it("deletes message on done action (AC-06)", async () => {
    const r = Reminder.reconstitute({ id: 1, snapshot: makeSnapshot(), state: "fired", firedMessageId: 42 });
    repo.reminders.set(1, r);
    const gateway = makeFakeGateway();
    const ctx = { answerCallbackQuery: vi.fn().mockResolvedValue(undefined) };

    await handleResolve(ctx as any, resolveUC, gateway, 1, "done", CHAT_ID);

    expect(gateway.deleteMessage).toHaveBeenCalledWith(CHAT_ID, 42);
    expect(repo.reminders.get(1)!.state).toBe("done");
  });

  it("falls back to editMessageToPlaceholder when delete throws TelegramDeleteWindowError (AC-06)", async () => {
    const r = Reminder.reconstitute({ id: 2, snapshot: makeSnapshot(2), state: "fired", firedMessageId: 43 });
    repo.reminders.set(2, r);
    const gateway = makeFakeGateway(true);
    const ctx = { answerCallbackQuery: vi.fn().mockResolvedValue(undefined) };

    await handleResolve(ctx as any, resolveUC, gateway, 2, "done", CHAT_ID);

    expect(gateway.editMessageToPlaceholder).toHaveBeenCalled();
  });

  it("deletes message on delete action (AC-07)", async () => {
    const r = Reminder.reconstitute({ id: 3, snapshot: makeSnapshot(3), state: "fired", firedMessageId: 44 });
    repo.reminders.set(3, r);
    const gateway = makeFakeGateway();
    const ctx = { answerCallbackQuery: vi.fn().mockResolvedValue(undefined) };

    await handleResolve(ctx as any, resolveUC, gateway, 3, "delete", CHAT_ID);

    expect(gateway.deleteMessage).toHaveBeenCalledWith(CHAT_ID, 44);
    expect(repo.reminders.get(3)!.state).toBe("deleted");
  });
});
