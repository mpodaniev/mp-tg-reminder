import type { TelegramGateway, SendReminderResult } from "../../app/ports/telegram-gateway.js";
import { TelegramDeleteWindowError } from "../../app/ports/telegram-gateway.js";
import type { Reminder } from "../../domain/reminder.js";
import { buildDeepLink } from "../../domain/value-objects/source-snapshot.js";

export interface TelegramApi {
  sendMessage(chatId: number, text: string, opts?: any): Promise<{ message_id: number }>;
  deleteMessage(chatId: number, messageId: number): Promise<unknown>;
  editMessageText(chatId: number, messageId: number, text: string, opts?: any): Promise<unknown>;
  answerCallbackQuery(callbackQueryId: string, opts?: any): Promise<unknown>;
}

export class GrammyTelegramGateway implements TelegramGateway {
  constructor(private readonly api: TelegramApi) {}

  async sendReminder(chatId: number, reminder: Reminder): Promise<SendReminderResult> {
    const { snapshot } = reminder;
    const deepLink = buildDeepLink(snapshot);

    let text = "";
    if (snapshot.messageText) {
      text += snapshot.messageText;
    }
    if (snapshot.isMediaProtected) {
      text += text ? "\n\n" : "";
      text += "⚠️ Media unavailable due to source restrictions.";
    }
    if (!text) {
      text = "📎 [No text content available]";
    }
    if (snapshot.senderName) {
      text = `👤 From: ${snapshot.senderName}\n\n${text}`;
    }

    // Done is retired (ADR-0001) — Delete is the sole resolving action; Snooze
    // reschedules rather than resolves.
    const keyboard = [
      [
        { text: "⏰ Snooze", callback_data: `snooze:${reminder.id}` },
        { text: "🗑 Delete", callback_data: `delete:${reminder.id}` },
      ],
      [{ text: "🔗 Go to source", callback_data: `source:${reminder.id}` }],
    ];

    const result = await this.api.sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: keyboard },
    });

    return { messageId: result.message_id };
  }

  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    try {
      await this.api.deleteMessage(chatId, messageId);
    } catch (err: any) {
      if (
        err?.error_code === 400 ||
        (err?.message && err.message.includes("can't be deleted"))
      ) {
        throw new TelegramDeleteWindowError();
      }
      throw err;
    }
  }

  async editMessageToPlaceholder(
    chatId: number,
    messageId: number,
    text: string
  ): Promise<void> {
    await this.api.editMessageText(chatId, messageId, text);
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await this.api.answerCallbackQuery(callbackQueryId, text ? { text } : undefined);
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    await this.api.sendMessage(chatId, text);
  }
}
