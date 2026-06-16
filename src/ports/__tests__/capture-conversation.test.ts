import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleForwardedMessage } from "../conversations/capture-conversation.js";
import { InMemoryReminderRepository } from "../../app/use-cases/__tests__/helpers/in-memory-repo.js";
import { CaptureMessage } from "../../app/use-cases/capture-message.js";
import { TimezoneNotConfiguredError, UnauthorizedError } from "../../domain/errors.js";

const OWNER_ID = 123456789;
const OWNER_CHAT_ID = 777;

function makeForwardedCtx(senderId = OWNER_ID, timezone = "Europe/Kyiv") {
  const repo = new InMemoryReminderRepository(senderId === OWNER_ID ? OWNER_ID : 999, timezone);
  const captureUC = new CaptureMessage(repo);

  const replies: string[] = [];
  const sentMarkups: any[] = [];

  const ctx = {
    from: { id: senderId },
    message: {
      forward_origin: { type: "user" },
      message_id: 1,
      chat: { id: OWNER_CHAT_ID, username: "source_chat" },
      text: "Forward content",
    },
    reply: vi.fn().mockImplementation((text: string, opts?: any) => {
      replies.push(text);
      sentMarkups.push(opts?.reply_markup);
      return Promise.resolve({ message_id: 10 });
    }),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    _replies: replies,
    _markups: sentMarkups,
    _repo: repo,
    _captureUC: captureUC,
  };

  return ctx;
}

function makeChannelForwardCtx(senderId = OWNER_ID, timezone = "Europe/Kyiv") {
  const repo = new InMemoryReminderRepository(OWNER_ID, timezone);
  const captureUC = new CaptureMessage(repo);

  const replies: string[] = [];
  const sentMarkups: any[] = [];

  const ctx = {
    from: { id: senderId },
    message: {
      forward_origin: { type: "channel", chat: { id: -100987654321, username: "my_channel" }, message_id: 42 },
      message_id: 999,
      chat: { id: OWNER_CHAT_ID, username: undefined },
      text: "Channel post content",
    },
    reply: vi.fn().mockImplementation((text: string, opts?: any) => {
      replies.push(text);
      sentMarkups.push(opts?.reply_markup);
      return Promise.resolve({ message_id: 10 });
    }),
    _replies: replies,
    _markups: sentMarkups,
    _repo: repo,
    _captureUC: captureUC,
  };

  return ctx;
}

describe("handleForwardedMessage (capture conversation entry)", () => {
  it("uses original message ID and chat username from forward_origin for channel forwards", async () => {
    const ctx = makeChannelForwardCtx();
    await handleForwardedMessage(ctx as any, ctx._captureUC);

    const reminders = [...ctx._repo.reminders.values()];
    expect(reminders.length).toBe(1);
    const { snapshot } = reminders[0]!;
    expect(snapshot.messageId).toBe(42);
    expect(snapshot.chatUsername).toBe("my_channel");
    expect(snapshot.chatId).toBe(-100987654321);
  });

  it("creates awaiting_time reminder and replies with quick-pick prompt (AC-01)", async () => {
    const ctx = makeForwardedCtx();
    await handleForwardedMessage(ctx as any, ctx._captureUC);

    expect(ctx._replies.length).toBeGreaterThan(0);
    const lastReply = ctx._replies[ctx._replies.length - 1];
    expect(lastReply.toLowerCase()).toMatch(/коли|when|remind/i);
    const markup = ctx._markups[ctx._markups.length - 1];
    expect(markup?.inline_keyboard).toBeDefined();
    const buttons = markup.inline_keyboard.flat();
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });

  it("silently ignores non-Owner messages (AC-09)", async () => {
    const ctx = makeForwardedCtx(999999);
    await handleForwardedMessage(ctx as any, ctx._captureUC);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("redirects to /settings when timezone is not set (AC-13)", async () => {
    const ctx = makeForwardedCtx(OWNER_ID, null as any);
    await handleForwardedMessage(ctx as any, ctx._captureUC);
    const replies = ctx._replies;
    expect(replies.some((r) => r.includes("/settings"))).toBe(true);
  });
});
