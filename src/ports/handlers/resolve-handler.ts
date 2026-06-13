import type { ResolveReminder } from "../../app/use-cases/resolve-reminder.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";
import { TelegramDeleteWindowError } from "../../app/ports/telegram-gateway.js";

type MinimalCtx = {
  answerCallbackQuery: (text?: string) => Promise<any>;
};

export async function handleResolve(
  ctx: MinimalCtx,
  resolveUC: ResolveReminder,
  gateway: TelegramGateway,
  reminderId: number,
  action: "done" | "delete",
  ownerChatId: number
): Promise<void> {
  const reminder = await resolveUC.execute({ reminderId, action });

  if (reminder.firedMessageId) {
    try {
      await gateway.deleteMessage(ownerChatId, reminder.firedMessageId);
    } catch (err) {
      if (err instanceof TelegramDeleteWindowError) {
        const placeholder =
          action === "done"
            ? "✅ Нагадування виконано"
            : "🗑 Нагадування видалено";
        await gateway.editMessageToPlaceholder(
          ownerChatId,
          reminder.firedMessageId,
          placeholder
        );
      } else {
        throw err;
      }
    }
  }

  await ctx.answerCallbackQuery();
}
