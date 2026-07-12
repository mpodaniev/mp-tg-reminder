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
    editListMessage: vi.fn().mockResolvedValue(undefined),
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

  it("guards a stale done tap: no message mutation, uniform toast, no state change (keep-fired-reminders-visible AC-06)", async () => {
    const r = Reminder.reconstitute({ id: 1, snapshot: makeSnapshot(), state: "fired", firedMessageId: 42 });
    repo.reminders.set(1, r);
    const gateway = makeFakeGateway();
    const ctx = { answerCallbackQuery: vi.fn().mockResolvedValue(undefined) };

    await handleResolve(ctx as any, resolveUC, gateway, 1, "done", CHAT_ID);

    expect(gateway.deleteMessage).not.toHaveBeenCalled();
    expect(gateway.editMessageToPlaceholder).not.toHaveBeenCalled();
    expect(repo.reminders.get(1)!.state).toBe("fired");
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(expect.stringMatching(/видалити/i));
  });

  it("a stale done tap on an already-deleted reminder still degrades gracefully, no crash (keep-fired-reminders-visible AC-06)", async () => {
    const r = Reminder.reconstitute({ id: 2, snapshot: makeSnapshot(2), state: "deleted", firedMessageId: 43 });
    repo.reminders.set(2, r);
    const gateway = makeFakeGateway();
    const ctx = { answerCallbackQuery: vi.fn().mockResolvedValue(undefined) };

    await expect(
      handleResolve(ctx as any, resolveUC, gateway, 2, "done", CHAT_ID)
    ).resolves.not.toThrow();

    expect(gateway.deleteMessage).not.toHaveBeenCalled();
    expect(repo.reminders.get(2)!.state).toBe("deleted");
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
  });

  it("a stale done tap on a non-existent/forged reminderId degrades gracefully, no unhandled throw (keep-fired-reminders-visible AC-06)", async () => {
    const gateway = makeFakeGateway();
    const ctx = { answerCallbackQuery: vi.fn().mockResolvedValue(undefined) };

    await expect(
      handleResolve(ctx as any, resolveUC, gateway, 999, "done", CHAT_ID)
    ).resolves.not.toThrow();

    expect(gateway.deleteMessage).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(expect.stringMatching(/видалити/i));
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

  it("never touches any /list message — delete on the fired-notification's own button stays isolated (issue #8)", async () => {
    const r = Reminder.reconstitute({ id: 5, snapshot: makeSnapshot(5), state: "fired", firedMessageId: 55 });
    repo.reminders.set(5, r);
    const gateway = makeFakeGateway();
    const ctx = { answerCallbackQuery: vi.fn().mockResolvedValue(undefined) };

    await handleResolve(ctx as any, resolveUC, gateway, 5, "delete", CHAT_ID);

    expect((gateway as any).editListMessage).not.toHaveBeenCalled();
  });

  it("guards a stale delete tap: no crash, no cleanup, uniform toast, no state change (issue #12)", async () => {
    const r = Reminder.reconstitute({ id: 6, snapshot: makeSnapshot(6), state: "pending", scheduledAt: Date.now() + 1000 });
    repo.reminders.set(6, r);
    const gateway = makeFakeGateway();
    const ctx = { answerCallbackQuery: vi.fn().mockResolvedValue(undefined) };

    await expect(
      handleResolve(ctx as any, resolveUC, gateway, 6, "delete", CHAT_ID)
    ).resolves.not.toThrow();

    expect(gateway.deleteMessage).not.toHaveBeenCalled();
    expect(repo.reminders.get(6)!.state).toBe("pending");
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(expect.stringMatching(/більше не активне/i));
  });

  it("a stale delete tap on a non-existent/forged reminderId degrades gracefully, no unhandled throw (issue #12)", async () => {
    const gateway = makeFakeGateway();
    const ctx = { answerCallbackQuery: vi.fn().mockResolvedValue(undefined) };

    await expect(
      handleResolve(ctx as any, resolveUC, gateway, 998, "delete", CHAT_ID)
    ).resolves.not.toThrow();

    expect(gateway.deleteMessage).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(expect.stringMatching(/більше не активне/i));
  });
});
