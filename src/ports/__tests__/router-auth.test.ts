import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRouter } from "../router.js";
import { InMemoryReminderRepository } from "../../app/use-cases/__tests__/helpers/in-memory-repo.js";
import { InMemoryPendingPromptRepository } from "../../app/use-cases/__tests__/helpers/in-memory-pending-prompt-repo.js";
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
    editListMessage: vi.fn().mockResolvedValue(undefined),
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
    router = buildRouter(repo, gateway, OWNER_CHAT_ID, new InMemoryPendingPromptRepository());
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

// T6 (AC-04b): characterizes every handleUpdate path's *current* auth behavior
// before the T7 refactor centralizes a single isOwner() gate at dispatch. Each
// path enforces ownership today through a different mechanism (or none at all
// for the callback_query branch above, which checks ctx.from.id === ownerChatId
// inline) — these tests pin exactly what happens today so T7 can prove it
// preserved every Owner-sender behavior while unifying (and, for forwarded
// messages, actually adding) the gate.
describe("Router: dispatch/auth characterization pre-T7 (AC-04b)", () => {
  let repo: InMemoryReminderRepository;
  let gateway: TelegramGateway;
  let router: ReturnType<typeof buildRouter>;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, TZ);
    gateway = makeGateway();
    router = buildRouter(repo, gateway, OWNER_CHAT_ID, new InMemoryPendingPromptRepository());
  });

  function makeForwardedCtx(senderId: number) {
    return {
      from: { id: senderId },
      message: {
        forward_date: 1700000000,
        message_id: 55,
        chat: { id: 100, username: "chat" },
        text: "forwarded text",
      },
      reply: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("Owner: forwarded message is captured and a quick-pick reply is sent", async () => {
    const ctx = makeForwardedCtx(OWNER_ID);
    await router.handleUpdate(ctx as any);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repo.reminders.size).toBe(1);
  });

  it("non-Owner: forwarded message is silently rejected today (CaptureMessage's own UnauthorizedError check) — no reminder, no reply", async () => {
    const ctx = makeForwardedCtx(NON_OWNER_ID);
    await router.handleUpdate(ctx as any);

    expect(ctx.reply).not.toHaveBeenCalled();
    expect(repo.reminders.size).toBe(0);
  });

  function makeCommandCtx(senderId: number, text: string) {
    return {
      from: { id: senderId },
      message: { text },
      reply: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("Owner: /settings with no args replies with the current timezone", async () => {
    const ctx = makeCommandCtx(OWNER_ID, "/settings");
    await router.handleUpdate(ctx as any);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
  });

  it("non-Owner: /settings is a silent no-op today (settings-handler's own ownerTelegramId check)", async () => {
    const ctx = makeCommandCtx(NON_OWNER_ID, "/settings");
    await router.handleUpdate(ctx as any);

    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("Owner: /list replies with the active-reminders view", async () => {
    const ctx = makeCommandCtx(OWNER_ID, "/list");
    await router.handleUpdate(ctx as any);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
  });

  it("non-Owner: /list is a silent no-op today (list-handler's own isOwner() check)", async () => {
    const ctx = makeCommandCtx(NON_OWNER_ID, "/list");
    await router.handleUpdate(ctx as any);

    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("non-Owner: /list reveals nothing even when a fired reminder is present (AC-05/AC-07)", async () => {
    repo.reminders.set(
      1,
      Reminder.reconstitute({ id: 1, snapshot: makeSnapshot(), state: "fired", firedAt: 1, scheduledAt: 1 })
    );
    const ctx = makeCommandCtx(NON_OWNER_ID, "/list");
    await router.handleUpdate(ctx as any);

    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("non-Owner: plain text with no pending prompt is a silent no-op (pendingCustom is only ever keyed by ownerChatId today)", async () => {
    const ctx = makeCommandCtx(NON_OWNER_ID, "за 2 год");
    await router.handleUpdate(ctx as any);

    expect(ctx.reply).not.toHaveBeenCalled();
  });
});

// T7 (ADR-0003, AC-04b): the router-level gate must deny a non-Owner sender on
// every path, not rely on the pendingCustom map happening to only ever be
// keyed by the Owner's id. This proves the exact gap ADR-0003 names at
// src/ports/router.ts:56-59 — before the gate, forcing a pendingCustom entry
// for a non-Owner id (as a future bug or race could) let their custom-time
// text through; after the gate, the sender is denied before that check ever runs.
describe("Router: centralized Owner gate at dispatch (T7, ADR-0003, AC-04b)", () => {
  let repo: InMemoryReminderRepository;
  let gateway: TelegramGateway;
  let pendingPromptRepo: InMemoryPendingPromptRepository;
  let router: ReturnType<typeof buildRouter>;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, TZ);
    gateway = makeGateway();
    pendingPromptRepo = new InMemoryPendingPromptRepository();
    router = buildRouter(repo, gateway, OWNER_CHAT_ID, pendingPromptRepo);
  });

  it("denies custom-time text input from a non-Owner even while a pending prompt is set", async () => {
    await pendingPromptRepo.savePendingPrompt({ type: "capture", reminderId: 1, createdAt: Date.now() });
    const r = Reminder.reconstitute({ id: 1, snapshot: makeSnapshot(), state: "awaiting_time" });
    repo.reminders.set(1, r);

    const ctx = {
      from: { id: NON_OWNER_ID },
      message: { text: "за 2 год" },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await router.handleUpdate(ctx as any);

    expect(ctx.reply).not.toHaveBeenCalled();
    const updated = await repo.findById(1);
    expect(updated!.state).toBe("awaiting_time");
  });

  it("Owner: custom-time text input still schedules the reminder (gate does not regress the Owner path)", async () => {
    await pendingPromptRepo.savePendingPrompt({ type: "capture", reminderId: 1, createdAt: Date.now() });
    const r = Reminder.reconstitute({ id: 1, snapshot: makeSnapshot(), state: "awaiting_time" });
    repo.reminders.set(1, r);

    const ctx = {
      from: { id: OWNER_ID },
      message: { text: "за 2 год" },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await router.handleUpdate(ctx as any);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const updated = await repo.findById(1);
    expect(updated!.state).toBe("pending");
  });
});
