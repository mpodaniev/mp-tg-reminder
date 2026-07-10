import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRouter } from "../router.js";
import { InMemoryReminderRepository } from "../../app/use-cases/__tests__/helpers/in-memory-repo.js";
import { InMemoryPendingPromptRepository } from "../../app/use-cases/__tests__/helpers/in-memory-pending-prompt-repo.js";
import { Reminder } from "../../domain/reminder.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";
import type { SourceSnapshot } from "../../domain/value-objects/source-snapshot.js";

const OWNER_ID = 123456789;
const NON_OWNER_ID = 999999;

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
    id,
    chatId: 100,
    messageId: 200 + id,
    chatUsername: null,
    senderName: null,
    senderUsername: null,
    messageText: text,
    mediaFileId: null,
    mediaType: null,
    isMediaProtected: false,
    createdAt: id,
  };
}

describe("Router: /stats wiring", () => {
  let repo: InMemoryReminderRepository;
  let router: ReturnType<typeof buildRouter>;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
    router = buildRouter(repo, makeGateway(), OWNER_ID, new InMemoryPendingPromptRepository());
  });

  function statsCtx(fromId: number) {
    return {
      message: { text: "/stats" },
      from: { id: fromId },
      reply: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("routes /stats for the Owner and replies with the stats summary", async () => {
    repo.reminders.set(
      1,
      Reminder.reconstitute({ id: 1, snapshot: snapshot(1, "task one"), state: "pending", createdAt: 1000 })
    );
    const ctx = statsCtx(OWNER_ID);
    await router.handleUpdate(ctx as any);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(ctx.reply.mock.calls[0]![0]).toContain("📊 Статистика нагадувань");
    expect(ctx.reply.mock.calls[0]![0]).toContain("Заплановано: 1");
  });

  it("ignores /stats from a non-Owner", async () => {
    const ctx = statsCtx(NON_OWNER_ID);
    await router.handleUpdate(ctx as any);
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});
