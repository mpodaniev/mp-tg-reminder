import type { Reminder } from "../../domain/reminder.js";

export interface SendReminderResult {
  messageId: number;
}

export interface TelegramGateway {
  sendReminder(chatId: number, reminder: Reminder): Promise<SendReminderResult>;

  deleteMessage(chatId: number, messageId: number): Promise<void>;

  editMessageToPlaceholder(
    chatId: number,
    messageId: number,
    text: string
  ): Promise<void>;

  /**
   * Edits both the text and inline keyboard of an existing message.
   * `inlineKeyboard: null` clears the keyboard entirely (empty-state case).
   */
  editListMessage(
    chatId: number,
    messageId: number,
    text: string,
    inlineKeyboard: any[][] | null
  ): Promise<void>;

  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;

  sendMessage(chatId: number, text: string): Promise<void>;
}

export class TelegramDeleteWindowError extends Error {
  constructor() {
    super("Message cannot be deleted: outside Telegram 48h delete window");
    this.name = "TelegramDeleteWindowError";
  }
}
