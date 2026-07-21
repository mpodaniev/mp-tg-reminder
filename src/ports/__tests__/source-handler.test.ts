import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSource } from "../handlers/source-handler.js";
import { InMemoryReminderRepository } from "../../app/use-cases/__tests__/helpers/in-memory-repo.js";
import { Reminder } from "../../domain/reminder.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";
import type { SourceSnapshot } from "../../domain/value-objects/source-snapshot.js";

const OWNER_ID = 123456789;
const CHAT_ID = 777;

function makeFakeGateway(): TelegramGateway {
  return {
    sendReminder: vi.fn().mockResolvedValue({ messageId: 1 }),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editMessageToPlaceholder: vi.fn().mockResolvedValue(undefined),
    editListMessage: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

function makeCtx() {
  return {
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

describe("handleSource callback handler", () => {
  let repo: InMemoryReminderRepository;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
  });

  it("sends deep link when chat_username and message_id present (AC-11 happy path)", async () => {
    const snapshot: SourceSnapshot = {
      id: 1,
      chatId: 100,
      messageId: 500,
      chatUsername: "publicchat",
      senderName: null,
      senderUsername: null,
      messageText: "link-able content",
      mediaFileId: null,
      mediaType: null,
      isMediaProtected: false,
      createdAt: Date.now(),
    };
    const r = Reminder.reconstitute({ id: 1, snapshot, state: "fired", firedMessageId: 42 });
    repo.reminders.set(1, r);
    const gateway = makeFakeGateway();
    const ctx = makeCtx();

    await handleSource(ctx as any, repo, gateway, 1, CHAT_ID);

    expect(gateway.sendMessage).toHaveBeenCalled();
    const [, text] = (gateway.sendMessage as any).mock.calls[0];
    expect(text).toContain("t.me/publicchat/500");
  });

  it("replies with inline content + note when deep link unavailable (AC-11 fallback)", async () => {
    const snapshot: SourceSnapshot = {
      id: 2,
      chatId: 100,
      messageId: 501,
      chatUsername: null,
      senderName: null,
      senderUsername: null,
      messageText: "private content",
      mediaFileId: null,
      mediaType: null,
      isMediaProtected: false,
      createdAt: Date.now(),
    };
    const r = Reminder.reconstitute({ id: 2, snapshot, state: "fired", firedMessageId: 43 });
    repo.reminders.set(2, r);
    const gateway = makeFakeGateway();
    const ctx = makeCtx();

    await handleSource(ctx as any, repo, gateway, 2, CHAT_ID);

    expect(gateway.sendMessage).toHaveBeenCalled();
    const [, text] = (gateway.sendMessage as any).mock.calls[0];
    expect(text).toContain("private content");
    expect(text.toLowerCase()).toMatch(/недоступне|unavailable|not available/);
  });

  // T3 (AC-06): locks the existing fallback branch against a typed-origin
  // snapshot exactly as capture-conversation.ts's handlePlainTextMessage
  // produces it — the no-source-chat sentinel (chatId: 0, messageId: 0,
  // chatUsername: null, sad.md §4 pillar 3) regardless of the Owner's own
  // chat having a public username — so "🔗 Джерело" always resolves to the
  // stored text, never a link, for a typed-origin reminder.
  it("shows the originally typed text back — never a link — for a typed-origin reminder, even with a public chat username on record (AC-06)", async () => {
    const typedOriginSnapshot: SourceSnapshot = {
      id: 3,
      chatId: 0,
      messageId: 0,
      chatUsername: null,
      senderName: null,
      senderUsername: null,
      messageText: "buy milk",
      mediaFileId: null,
      mediaType: null,
      isMediaProtected: false,
      createdAt: Date.now(),
    };
    const r = Reminder.reconstitute({ id: 3, snapshot: typedOriginSnapshot, state: "fired", firedMessageId: 44 });
    repo.reminders.set(3, r);
    const gateway = makeFakeGateway();
    const ctx = makeCtx();

    await handleSource(ctx as any, repo, gateway, 3, CHAT_ID);

    expect(gateway.sendMessage).toHaveBeenCalled();
    const [, text] = (gateway.sendMessage as any).mock.calls[0];
    expect(text).toContain("buy milk");
    expect(text).not.toContain("t.me/");
  });
});
