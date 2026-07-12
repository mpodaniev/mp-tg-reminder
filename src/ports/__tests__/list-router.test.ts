import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRouter } from "../router.js";
import { InMemoryReminderRepository } from "../../app/use-cases/__tests__/helpers/in-memory-repo.js";
import { InMemoryPendingPromptRepository } from "../../app/use-cases/__tests__/helpers/in-memory-pending-prompt-repo.js";
import { Reminder } from "../../domain/reminder.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";
import type { SourceSnapshot } from "../../domain/value-objects/source-snapshot.js";

const OWNER_ID = 123456789;
const NON_OWNER_ID = 999999;
const TZ = "Europe/Kyiv";

function makeGateway(): TelegramGateway {
  return {
    sendReminder: vi.fn().mockResolvedValue({ messageId: 99 }),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editMessageToPlaceholder: vi.fn().mockResolvedValue(undefined),
    editListMessage: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

function snapshot(id: number, text: string): SourceSnapshot {
  return {
    id, chatId: 100, messageId: 200 + id, chatUsername: null,
    senderName: null, senderUsername: null, messageText: text,
    mediaFileId: null, mediaType: null, isMediaProtected: false, createdAt: id,
  };
}

function pending(id: number, scheduledAt: number, text: string): Reminder {
  return Reminder.reconstitute({ id, snapshot: snapshot(id, text), state: "pending", scheduledAt });
}

describe("Router: /list wiring (T8, AC-05/AC-07)", () => {
  let repo: InMemoryReminderRepository;
  let router: ReturnType<typeof buildRouter>;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, TZ);
    router = buildRouter(repo, makeGateway(), OWNER_ID, new InMemoryPendingPromptRepository());
  });

  function listCtx(fromId: number) {
    return { message: { text: "/list" }, from: { id: fromId }, reply: vi.fn().mockResolvedValue(undefined) };
  }

  function cancelCtx(fromId: number) {
    return {
      from: { id: fromId },
      callbackQuery: { id: "cq", data: "cancel:1" },
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("routes /list for the Owner and replies with the Active list (AC-07)", async () => {
    repo.reminders.set(1, pending(1, Date.UTC(2026, 5, 20, 11, 30), "task one"));
    const ctx = listCtx(OWNER_ID);
    await router.handleUpdate(ctx as any);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(ctx.reply.mock.calls[0]![0]).toContain("task one");
  });

  it("produces an identical response for both /list entry points (typed and menu) (AC-07)", async () => {
    repo.reminders.set(1, pending(1, Date.UTC(2026, 5, 20, 11, 30), "task one"));

    const typed = listCtx(OWNER_ID);
    await router.handleUpdate(typed as any);
    const menu = listCtx(OWNER_ID); // command-menu pick delivers the same /list message
    await router.handleUpdate(menu as any);

    expect(typed.reply.mock.calls[0]![0]).toEqual(menu.reply.mock.calls[0]![0]);
  });

  it("ignores /list from a non-Owner — reveals nothing (AC-05)", async () => {
    repo.reminders.set(1, pending(1, 1000, "secret"));
    const ctx = listCtx(NON_OWNER_ID);
    await router.handleUpdate(ctx as any);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("cancels a pending reminder via the cancel callback for the Owner (AC-03)", async () => {
    repo.reminders.set(1, pending(1, Date.now() + 60_000, "doomed"));
    const ctx = cancelCtx(OWNER_ID);
    await router.handleUpdate(ctx as any);

    expect((await repo.findById(1))!.state).toBe("deleted");
    expect(ctx.reply).toHaveBeenCalled();
  });

  it("ignores the cancel callback from a non-Owner — no mutation (AC-05)", async () => {
    repo.reminders.set(1, pending(1, Date.now() + 60_000, "doomed"));
    const ctx = cancelCtx(NON_OWNER_ID);
    await router.handleUpdate(ctx as any);

    expect((await repo.findById(1))!.state).toBe("pending");
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});
