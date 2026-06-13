import type { ReminderRepository } from "../../app/ports/reminder-repository.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";
import { buildDeepLink, hasPublicDeepLink } from "../../domain/value-objects/source-snapshot.js";

type MinimalCtx = {
  answerCallbackQuery: (text?: string) => Promise<any>;
};

export async function handleSource(
  ctx: MinimalCtx,
  repo: ReminderRepository,
  gateway: TelegramGateway,
  reminderId: number,
  ownerChatId: number
): Promise<void> {
  const reminder = await repo.findById(reminderId);
  if (!reminder) {
    await ctx.answerCallbackQuery("❌ Нагадування не знайдено.");
    return;
  }

  const { snapshot } = reminder;

  if (hasPublicDeepLink(snapshot)) {
    const link = buildDeepLink(snapshot)!;
    await gateway.sendMessage(
      ownerChatId,
      `🔗 Посилання на оригінальне повідомлення: ${link}`
    );
  } else {
    const content = snapshot.messageText ?? "[Вміст недоступний]";
    await gateway.sendMessage(
      ownerChatId,
      `🔗 Пряме посилання недоступне (приватний чат або DM).\n\n${content}`
    );
  }

  await ctx.answerCallbackQuery();
}
