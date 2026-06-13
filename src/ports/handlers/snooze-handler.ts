import type { SnoozeReminder } from "../../app/use-cases/snooze-reminder.js";
import type { ReminderRepository } from "../../app/ports/reminder-repository.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";
import { AlreadyResolvedError } from "../../domain/errors.js";
import { localTodayAt, getOwnerHour } from "../tz-utils.js";

type MinimalCtx = {
  answerCallbackQuery: (text: string, opts?: any) => Promise<any>;
  reply: (text: string, opts?: any) => Promise<any>;
};

export async function handleSnooze(
  ctx: MinimalCtx,
  snoozeUC: SnoozeReminder,
  repo: ReminderRepository,
  reminderId: number
): Promise<void> {
  const reminder = await repo.findById(reminderId);
  if (!reminder) {
    await ctx.answerCallbackQuery("❌ Нагадування не знайдено.");
    return;
  }
  if (reminder.isResolved()) {
    await ctx.answerCallbackQuery("❌ Нагадування вже вирішено — дія неможлива.");
    return;
  }

  const settings = await repo.getOwnerSettings();
  const timezone = settings?.timezone ?? "UTC";
  const nowMs = Date.now();
  const hour = getOwnerHour(timezone, nowMs);

  const rows: any[][] = [
    [{ text: "⏱ За 1 годину", callback_data: `snooze_pick:${reminderId}:1h` }],
  ];

  if (hour < 19) {
    rows.push([{ text: "🌆 Сьогодні о 19:00", callback_data: `snooze_pick:${reminderId}:evening` }]);
  }

  rows.push([{ text: "🌅 Завтра о 07:00", callback_data: `snooze_pick:${reminderId}:tomorrow` }]);
  rows.push([{ text: "📅 Через тиждень", callback_data: `snooze_pick:${reminderId}:week` }]);
  rows.push([{ text: "✏️ Довільний час", callback_data: `snooze_pick:${reminderId}:custom` }]);

  await ctx.reply("⏰ Відкласти на:", {
    reply_markup: { inline_keyboard: rows },
  });
}

export async function handleSnoozePick(
  ctx: MinimalCtx,
  snoozeUC: SnoozeReminder,
  repo: ReminderRepository,
  reminderId: number,
  pick: string,
  gateway: TelegramGateway,
  ownerChatId: number
): Promise<void> {
  const settings = await repo.getOwnerSettings();
  const timezone = settings?.timezone ?? "UTC";

  let scheduledAt: number;

  if (pick === "1h") {
    scheduledAt = Date.now() + 60 * 60 * 1000;
  } else if (pick === "week") {
    scheduledAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  } else if (pick === "evening") {
    scheduledAt = localTodayAt(timezone, 19, 0, 0);
  } else if (pick === "tomorrow") {
    scheduledAt = localTodayAt(timezone, 7, 0, 1);
  } else {
    scheduledAt = Date.now() + 60 * 60 * 1000;
  }

  try {
    const reminder = await repo.findById(reminderId);
    const firedMessageId = reminder?.firedMessageId ?? null;

    await snoozeUC.execute({ reminderId, newScheduledAtMs: scheduledAt });

    if (firedMessageId !== null) {
      const scheduledDate = new Intl.DateTimeFormat("uk", {
        timeZone: timezone,
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(scheduledAt));
      await gateway.editMessageToPlaceholder(
        ownerChatId,
        firedMessageId,
        `⏰ Відкладено до ${scheduledDate}`
      );
    }

    await ctx.answerCallbackQuery("✅ Нагадування відкладено");
    await ctx.reply("✅ Нагадування відкладено!");
  } catch (err) {
    if (err instanceof AlreadyResolvedError) {
      await ctx.answerCallbackQuery("❌ Нагадування вже вирішено — дія неможлива.");
      return;
    }
    throw err;
  }
}
