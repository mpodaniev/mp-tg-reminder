import type { ResolveReminder } from "../../app/use-cases/resolve-reminder.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";
import { TelegramDeleteWindowError } from "../../app/ports/telegram-gateway.js";
import { InvalidStateTransitionError, ReminderNotFoundError } from "../../domain/errors.js";

type MinimalCtx = {
  answerCallbackQuery: (text?: string) => Promise<any>;
};

// Retired-action toast (ADR-0001) — a stale `done` tap from a pre-rollout
// message must not crash and must not resolve the reminder (AC-06).
const DONE_RETIRED_MESSAGE = "⚠️ Цю дію прибрано. Використайте 🗑 Видалити.";

// Uniform reply for a stale/repeat `delete` tap on a reminder that is no
// longer `fired` (already deleted, or never fired) — mirrors the same
// no-crash guarantee AC-06 gives `done`, extended to `delete` (issue #12).
const STALE_DELETE_MESSAGE = "⚠️ Це нагадування більше не активне.";

/**
 * Clears the original fired-reminder notification in chat: deletes it if
 * still within Telegram's 48h delete window, otherwise replaces its text
 * with a placeholder. No-ops when there is no notification to clean up.
 */
export async function cleanupFiredNotification(
  gateway: TelegramGateway,
  chatId: number,
  firedMessageId: number | null
): Promise<void> {
  if (!firedMessageId) return;
  try {
    await gateway.deleteMessage(chatId, firedMessageId);
  } catch (err) {
    if (err instanceof TelegramDeleteWindowError) {
      await gateway.editMessageToPlaceholder(chatId, firedMessageId, "🗑 Нагадування видалено");
    } else {
      throw err;
    }
  }
}

export async function handleResolve(
  ctx: MinimalCtx,
  resolveUC: ResolveReminder,
  gateway: TelegramGateway,
  reminderId: number,
  action: "done" | "delete",
  ownerChatId: number
): Promise<void> {
  let reminder;
  try {
    reminder = await resolveUC.execute({ reminderId, action });
  } catch (err) {
    if (err instanceof InvalidStateTransitionError || err instanceof ReminderNotFoundError) {
      await ctx.answerCallbackQuery(action === "done" ? DONE_RETIRED_MESSAGE : STALE_DELETE_MESSAGE);
      return;
    }
    throw err;
  }

  await cleanupFiredNotification(gateway, ownerChatId, reminder.firedMessageId);

  await ctx.answerCallbackQuery();
}
