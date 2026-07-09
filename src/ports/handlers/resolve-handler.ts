import type { ResolveReminder } from "../../app/use-cases/resolve-reminder.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";
import { TelegramDeleteWindowError } from "../../app/ports/telegram-gateway.js";
import { InvalidStateTransitionError } from "../../domain/errors.js";

type MinimalCtx = {
  answerCallbackQuery: (text?: string) => Promise<any>;
};

// Retired-action toast (ADR-0001) — a stale `done` tap from a pre-rollout
// message must not crash and must not resolve the reminder (AC-06).
const DONE_RETIRED_MESSAGE = "⚠️ Цю дію прибрано. Використайте 🗑 Видалити.";

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
    if (action === "done" && err instanceof InvalidStateTransitionError) {
      await ctx.answerCallbackQuery(DONE_RETIRED_MESSAGE);
      return;
    }
    throw err;
  }

  if (reminder.firedMessageId) {
    try {
      await gateway.deleteMessage(ownerChatId, reminder.firedMessageId);
    } catch (err) {
      if (err instanceof TelegramDeleteWindowError) {
        await gateway.editMessageToPlaceholder(
          ownerChatId,
          reminder.firedMessageId,
          "🗑 Нагадування видалено"
        );
      } else {
        throw err;
      }
    }
  }

  await ctx.answerCallbackQuery();
}
