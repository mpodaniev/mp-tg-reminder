import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRouter } from "../router.js";
import { InMemoryReminderRepository } from "../../app/use-cases/__tests__/helpers/in-memory-repo.js";
import { InMemoryPendingPromptRepository } from "../../app/use-cases/__tests__/helpers/in-memory-pending-prompt-repo.js";
import { Reminder } from "../../domain/reminder.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";
import type { SourceSnapshot } from "../../domain/value-objects/source-snapshot.js";

const OWNER_ID = 123456789;
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

function snapshot(id: number, text: string): SourceSnapshot {
  return {
    id, chatId: 100, messageId: 200 + id, chatUsername: null,
    senderName: null, senderUsername: null, messageText: text,
    mediaFileId: null, mediaType: null, isMediaProtected: false, createdAt: id,
  };
}

function deleted(id: number, text: string): Reminder {
  return Reminder.reconstitute({ id, snapshot: snapshot(id, text), state: "deleted" });
}

describe("Router: quick-pick on a stale (no longer awaiting_time) reminder", () => {
  let repo: InMemoryReminderRepository;
  let router: ReturnType<typeof buildRouter>;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, TZ);
    router = buildRouter(repo, makeGateway(), OWNER_ID, new InMemoryPendingPromptRepository());
  });

  function qpickCtx(fromId: number, reminderId: number, pick: string) {
    return {
      from: { id: fromId },
      callbackQuery: { id: "cq", data: `qpick:${reminderId}:${pick}` },
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("replies with a no-op message instead of throwing when the reminder is no longer awaiting_time", async () => {
    repo.reminders.set(1, deleted(1, "stale"));
    const ctx = qpickCtx(OWNER_ID, 1, "1h");

    await expect(router.handleUpdate(ctx as any)).resolves.not.toThrow();
    expect(ctx.reply).toHaveBeenCalled();
  });
});
