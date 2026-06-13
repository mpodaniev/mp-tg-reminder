import type { ReminderRepository } from "../../app/ports/reminder-repository.js";

type MinimalCtx = {
  from?: { id: number };
  message?: { text?: string };
  reply: (text: string, opts?: any) => Promise<any>;
};

export async function handleSettings(
  ctx: MinimalCtx,
  repo: ReminderRepository
): Promise<void> {
  const senderId = ctx.from?.id;
  if (!senderId) return;

  const settings = await repo.getOwnerSettings();
  if (!settings || settings.ownerTelegramId !== senderId) return;

  const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
  const timezone = parts[1];

  if (!timezone) {
    const current = settings.timezone
      ? `Поточний часовий пояс: **${settings.timezone}**`
      : "Часовий пояс не налаштований.";
    await ctx.reply(
      `${current}\n\nВикористайте /settings <IANA-zone>, наприклад:\n/settings Europe/Kyiv`
    );
    return;
  }

  try {
    // Validate IANA zone
    new Intl.DateTimeFormat("uk", { timeZone: timezone });
  } catch {
    await ctx.reply(`❌ Невідомий часовий пояс: ${timezone}. Вкажіть правильну IANA-зону, наприклад Europe/Kyiv.`);
    return;
  }

  await repo.upsertOwnerSettings(senderId, timezone);
  await ctx.reply(`✅ Часовий пояс встановлено: ${timezone}`);
}
