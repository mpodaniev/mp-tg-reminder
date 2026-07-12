import { describe, it, expect, vi, beforeEach } from "vitest";
import { GrammyTelegramGateway } from "../telegram/grammy-telegram-gateway.js";
import { Reminder } from "../../domain/reminder.js";
import type { SourceSnapshot } from "../../domain/value-objects/source-snapshot.js";
import { TelegramDeleteWindowError } from "../../app/ports/telegram-gateway.js";

function makeSnapshot(overrides: Partial<SourceSnapshot> = {}): SourceSnapshot {
  return {
    id: 1,
    chatId: 100,
    messageId: 200,
    chatUsername: "testchat",
    senderName: "Alice",
    senderUsername: "alice",
    messageText: "Remind me of this",
    mediaFileId: null,
    mediaType: null,
    isMediaProtected: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeFiredReminder(snapshotOverrides: Partial<SourceSnapshot> = {}): Reminder {
  return Reminder.reconstitute({
    id: 1,
    snapshot: makeSnapshot(snapshotOverrides),
    state: "fired",
    scheduledAt: Date.now() - 1000,
    firedAt: Date.now() - 500,
    deliveredAt: Date.now() - 400,
    firedMessageId: 42,
  });
}

describe("GrammyTelegramGateway", () => {
  let mockApi: any;
  let gateway: GrammyTelegramGateway;

  beforeEach(() => {
    mockApi = {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 99 }),
      deleteMessage: vi.fn().mockResolvedValue(true),
      editMessageText: vi.fn().mockResolvedValue(true),
      answerCallbackQuery: vi.fn().mockResolvedValue(true),
    };
    gateway = new GrammyTelegramGateway(mockApi);
  });

  it("sendReminder calls api.sendMessage with correct chat_id and a 3-button keyboard (no Done, ADR-0001)", async () => {
    const reminder = makeFiredReminder();
    const result = await gateway.sendReminder(777, reminder);

    expect(mockApi.sendMessage).toHaveBeenCalledOnce();
    const [chatId, _text, opts] = mockApi.sendMessage.mock.calls[0];
    expect(chatId).toBe(777);
    expect(opts?.reply_markup?.inline_keyboard).toBeDefined();
    const buttons = opts.reply_markup.inline_keyboard.flat();
    const callbackDatas = buttons.map((b: any) => b.callback_data);
    expect(callbackDatas.some((d: string) => d.includes("snooze"))).toBe(true);
    expect(callbackDatas.some((d: string) => d.includes("delete"))).toBe(true);
    expect(callbackDatas.some((d: string) => d.includes("source"))).toBe(true);
    expect(callbackDatas.some((d: string) => d.startsWith("done"))).toBe(false);
    expect(result.messageId).toBe(99);
  });

  it("sendReminder with protected media includes restriction note and the 3-button keyboard (AC-12, ADR-0001)", async () => {
    const reminder = makeFiredReminder({ isMediaProtected: true, messageText: "Secret note" });
    await gateway.sendReminder(777, reminder);

    const [_chatId, text, opts] = mockApi.sendMessage.mock.calls[0];
    expect(text).toContain("Secret note");
    expect(text).toMatch(/unavailable.*restriction|restriction.*unavailable/i);
    const buttons = opts.reply_markup.inline_keyboard.flat();
    expect(buttons.length).toBe(3);
    const datas = buttons.map((b: any) => b.callback_data);
    expect(datas.some((d: string) => d.includes("snooze"))).toBe(true);
    expect(datas.some((d: string) => d.includes("delete"))).toBe(true);
    expect(datas.some((d: string) => d.includes("source"))).toBe(true);
    expect(datas.some((d: string) => d.startsWith("done"))).toBe(false);
  });

  it("sendReminder with no text and protected media uses fallback text + note (AC-12)", async () => {
    const reminder = makeFiredReminder({ isMediaProtected: true, messageText: null });
    await gateway.sendReminder(777, reminder);

    const [_chatId, text] = mockApi.sendMessage.mock.calls[0];
    expect(text).toMatch(/unavailable.*restriction|restriction.*unavailable/i);
  });

  it("deleteMessage calls api.deleteMessage", async () => {
    await gateway.deleteMessage(777, 42);
    expect(mockApi.deleteMessage).toHaveBeenCalledWith(777, 42);
  });

  it("deleteMessage throws TelegramDeleteWindowError on 48h error (400 Bad Request: message can't be deleted)", async () => {
    mockApi.deleteMessage.mockRejectedValue(
      Object.assign(new Error("Bad Request: message can't be deleted for everyone"), {
        error_code: 400,
      })
    );
    await expect(gateway.deleteMessage(777, 42)).rejects.toThrow(
      TelegramDeleteWindowError
    );
  });

  it("editMessageToPlaceholder calls api.editMessageText", async () => {
    await gateway.editMessageToPlaceholder(777, 42, "✅ Done");
    expect(mockApi.editMessageText).toHaveBeenCalledWith(777, 42, "✅ Done");
  });

  it("editListMessage calls api.editMessageText with the given text and keyboard", async () => {
    const keyboard = [[{ text: "🗑 Скасувати #1", callback_data: "cancel:1" }]];
    await gateway.editListMessage(777, 42, "📋 Активні нагадування:\n\n1. row", keyboard);
    expect(mockApi.editMessageText).toHaveBeenCalledWith(
      777,
      42,
      "📋 Активні нагадування:\n\n1. row",
      { reply_markup: { inline_keyboard: keyboard } }
    );
  });

  it("editListMessage clears the keyboard when passed null (empty-state case)", async () => {
    await gateway.editListMessage(777, 42, "📭 Немає активних нагадувань.", null);
    expect(mockApi.editMessageText).toHaveBeenCalledWith(
      777,
      42,
      "📭 Немає активних нагадувань.",
      { reply_markup: { inline_keyboard: [] } }
    );
  });
});
