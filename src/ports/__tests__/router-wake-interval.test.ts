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
    editListMessage: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

function snapshot(id: number): SourceSnapshot {
  return {
    id, chatId: 100, messageId: 200 + id, chatUsername: null,
    senderName: null, senderUsername: null, messageText: "t",
    mediaFileId: null, mediaType: null, isMediaProtected: false, createdAt: id,
  };
}

function qpickCtx(reminderId: number, pick: string) {
  return {
    from: { id: OWNER_ID },
    callbackQuery: { id: "cq", data: `qpick:${reminderId}:${pick}` },
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

// AC-03: the delay estimate must reflect the deployed wake cadence, which is
// threaded from the composition root — not a compile-time constant. A quick-pick
// "1h" (schedules ~1h out) gets the "may be late" note only when the configured
// wake interval is wider than 1h.
describe("Router: AC-03 delay estimate uses the configured wake interval", () => {
  let repo: InMemoryReminderRepository;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, TZ);
    repo.reminders.set(1, Reminder.reconstitute({ id: 1, snapshot: snapshot(1), state: "awaiting_time" }));
  });

  it("appends the late-delivery note when the wake interval is wider than the chosen time", async () => {
    const router = buildRouter(repo, makeGateway(), OWNER_ID, new InMemoryPendingPromptRepository(), 2 * 60 * 60 * 1000);
    const ctx = qpickCtx(1, "1h");

    await router.handleUpdate(ctx as any);

    const reply = ctx.reply.mock.calls[0]?.[0] as string;
    expect(reply).toContain("⏳");
  });

  it("omits the note under the default 3-min interval for the same 1h pick", async () => {
    const router = buildRouter(repo, makeGateway(), OWNER_ID, new InMemoryPendingPromptRepository(), 3 * 60 * 1000);
    const ctx = qpickCtx(1, "1h");

    await router.handleUpdate(ctx as any);

    const reply = ctx.reply.mock.calls[0]?.[0] as string;
    expect(reply).not.toContain("⏳");
  });
});
