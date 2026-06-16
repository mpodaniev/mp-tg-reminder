import type { CaptureMessage } from "../../app/use-cases/capture-message.js";
import { TimezoneNotConfiguredError, UnauthorizedError } from "../../domain/errors.js";

type MinimalCtx = {
  from?: { id: number };
  message?: {
    forward_origin?: unknown;
    message_id?: number;
    chat?: { id: number; username?: string | null };
    text?: string | null;
    caption?: string | null;
    photo?: unknown[];
    video?: unknown;
    document?: unknown;
    forward_from?: { first_name?: string; username?: string } | null;
    forward_from_chat?: { title?: string; username?: string } | null;
    is_automatic_forward?: boolean;
    has_protected_content?: boolean;
  };
  reply: (text: string, opts?: any) => Promise<any>;
};

const QUICK_PICKS = [
  { label: "⏱ За 1 годину", offsetMs: 60 * 60 * 1000 },
  { label: "🌆 Сьогодні о 19:00", type: "evening" as const },
  { label: "🌅 Завтра о 07:00", type: "tomorrow" as const },
  { label: "📅 Через тиждень", offsetMs: 7 * 24 * 60 * 60 * 1000 },
];

function buildQuickPickKeyboard(reminderId: number, timezone: string, now: Date): any[][] {
  const rows: any[][] = [];

  // "In 1 hour"
  rows.push([{
    text: "⏱ За 1 годину",
    callback_data: `qpick:${reminderId}:1h`,
  }]);

  // Evening pick — only if wall-clock is before 19:00 in Owner timezone
  const hour = new Intl.DateTimeFormat("uk", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).format(now);
  if (Number(hour) < 19) {
    rows.push([{
      text: "🌆 Сьогодні о 19:00",
      callback_data: `qpick:${reminderId}:evening`,
    }]);
  }

  rows.push([{
    text: "🌅 Завтра о 07:00",
    callback_data: `qpick:${reminderId}:tomorrow`,
  }]);

  rows.push([{
    text: "📅 Через тиждень",
    callback_data: `qpick:${reminderId}:week`,
  }]);

  rows.push([{
    text: "✏️ Довільний час",
    callback_data: `qpick:${reminderId}:custom`,
  }]);

  return rows;
}

export async function handleForwardedMessage(
  ctx: MinimalCtx,
  captureUC: CaptureMessage
): Promise<void> {
  const senderId = ctx.from?.id;
  if (!senderId) return;

  const msg = ctx.message;
  if (!msg) return;

  const origin = msg.forward_origin as any;
  // For channel forwards (Bot API 7.0+), use the original message ID and chat
  // from forward_origin — msg.message_id is the ID in the bot chat, not the source.
  const isChannelForward = origin?.type === "channel";
  const sourceChatId = isChannelForward ? (origin?.chat?.id ?? msg.chat?.id ?? 0) : (msg.chat?.id ?? 0);
  const sourceMessageId = isChannelForward ? (origin?.message_id ?? msg.message_id ?? 0) : (msg.message_id ?? 0);
  const sourceChatUsername = isChannelForward
    ? (origin?.chat?.username ?? null)
    : ((msg.forward_from_chat as any)?.username ?? msg.chat?.username ?? null);

  const snapshot = {
    chatId: sourceChatId,
    messageId: sourceMessageId,
    chatUsername: sourceChatUsername,
    senderName: (msg.forward_from as any)?.first_name ?? null,
    senderUsername: (msg.forward_from as any)?.username ?? null,
    messageText: msg.text ?? msg.caption ?? null,
    mediaFileId: null as string | null,
    mediaType: null as string | null,
    isMediaProtected: msg.has_protected_content ?? false,
  };

  try {
    const reminder = await captureUC.execute({ senderTelegramId: senderId, snapshot });

    const settings = await captureUC.repo.getOwnerSettings();
    const timezone = settings?.timezone ?? "UTC";

    const keyboard = buildQuickPickKeyboard(reminder.id!, timezone, new Date());

    await ctx.reply("⏰ Коли нагадати?", {
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return;
    }
    if (err instanceof TimezoneNotConfiguredError) {
      await ctx.reply(
        "⚙️ Спочатку налаштуйте свій часовий пояс за допомогою /settings, щоб я міг правильно розрахувати час нагадувань."
      );
      return;
    }
    throw err;
  }
}
