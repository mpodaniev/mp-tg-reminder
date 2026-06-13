import { describe, it, expect, vi, beforeEach } from "vitest";
import { GrammyTelegramGateway } from "../telegram/grammy-telegram-gateway.js";
import { Reminder } from "../../domain/reminder.js";
import type { SourceSnapshot } from "../../domain/value-objects/source-snapshot.js";
import { TelegramDeleteWindowError } from "../../app/ports/telegram-gateway.js";

function makeSnapshot(): SourceSnapshot {
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
  };
}

function makeFiredReminder(): Reminder {
  return Reminder.reconstitute({
    id: 1,
    snapshot: makeSnapshot(),
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

  it("sendReminder calls api.sendMessage with correct chat_id and 4-button keyboard", async () => {
    const reminder = makeFiredReminder();
    const result = await gateway.sendReminder(777, reminder);

    expect(mockApi.sendMessage).toHaveBeenCalledOnce();
    const [chatId, _text, opts] = mockApi.sendMessage.mock.calls[0];
    expect(chatId).toBe(777);
    expect(opts?.reply_markup?.inline_keyboard).toBeDefined();
    const buttons = opts.reply_markup.inline_keyboard.flat();
    const callbackDatas = buttons.map((b: any) => b.callback_data);
    expect(callbackDatas.some((d: string) => d.includes("snooze"))).toBe(true);
    expect(callbackDatas.some((d: string) => d.includes("done"))).toBe(true);
    expect(callbackDatas.some((d: string) => d.includes("delete"))).toBe(true);
    expect(callbackDatas.some((d: string) => d.includes("source"))).toBe(true);
    expect(result.messageId).toBe(99);
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
});
