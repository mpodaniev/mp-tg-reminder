import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRouter } from "../router.js";
import { InMemoryReminderRepository } from "../../app/use-cases/__tests__/helpers/in-memory-repo.js";
import { Reminder } from "../../domain/reminder.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";
import type { SourceSnapshot } from "../../domain/value-objects/source-snapshot.js";

const OWNER_ID = 123456789;
const NON_OWNER_ID = 999999;
const OWNER_CHAT_ID = OWNER_ID;
const TZ = "Europe/Kyiv";

function makeGateway(): TelegramGateway {
  return {
    sendReminder: vi.fn().mockResolvedValue({ messageId: 99 }),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editMessageToPlaceholder: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSnapshot(id = 1): SourceSnapshot {
  return {
    id, chatId: 100, messageId: 200 + id, chatUsername: null,
    senderName: null, senderUsername: null, messageText: "test",
    mediaFileId: null, mediaType: null, isMediaProtected: false,
    createdAt: Date.now(),
  };
}

describe("Router: non-Owner callbacks silently ignored (AC-09)", () => {
  let repo: InMemoryReminderRepository;
  let gateway: TelegramGateway;
  let router: ReturnType<typeof buildRouter>;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, TZ);
    gateway = makeGateway();
    router = buildRouter(repo, gateway, OWNER_CHAT_ID);
  });

  function makeNonOwnerCallbackCtx(data: string) {
    return {
      from: { id: NON_OWNER_ID },
      callbackQuery: { id: "cq-nonowner", data },
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("ignores snooze callback from non-Owner — no reply sent (AC-09)", async () => {
    const r = Reminder.reconstitute({ id: 1, snapshot: makeSnapshot(), state: "fired", firedMessageId: 42 });
    repo.reminders.set(1, r);

    const ctx = makeNonOwnerCallbackCtx("snooze:1");
    await router.handleUpdate(ctx as any);

    expect(ctx.reply).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).not.toHaveBeenCalled();
    const updated = await repo.findById(1);
    expect(updated!.state).toBe("fired");
  });

  it("ignores done callback from non-Owner — no mutation (AC-09)", async () => {
    const r = Reminder.reconstitute({ id: 2, snapshot: makeSnapshot(2), state: "fired", firedMessageId: 55 });
    repo.reminders.set(2, r);

    const ctx = makeNonOwnerCallbackCtx("done:2");
    await router.handleUpdate(ctx as any);

    expect(ctx.reply).not.toHaveBeenCalled();
    const updated = await repo.findById(2);
    expect(updated!.state).toBe("fired");
  });

  it("ignores qpick callback from non-Owner — reminder stays awaiting (AC-09)", async () => {
    const r = Reminder.reconstitute({ id: 3, snapshot: makeSnapshot(3), state: "awaiting_time" });
    repo.reminders.set(3, r);

    const ctx = makeNonOwnerCallbackCtx("qpick:3:1h");
    await router.handleUpdate(ctx as any);

    expect(ctx.reply).not.toHaveBeenCalled();
    const updated = await repo.findById(3);
    expect(updated!.state).toBe("awaiting_time");
  });
});
