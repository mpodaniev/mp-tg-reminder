import type { SnoozeReminder } from "../../app/use-cases/snooze-reminder.js";
import { AlreadyResolvedError } from "../../domain/errors.js";

type MinimalCtx = {
  answerCallbackQuery: (text: string, opts?: any) => Promise<any>;
  reply: (text: string, opts?: any) => Promise<any>;
};

export async function handleSnooze(
  ctx: MinimalCtx,
  snoozeUC: SnoozeReminder,
  reminderId: number
): Promise<void> {
  // First show the snooze options keyboard
  const now = new Date();
  const hour = now.getHours();

  const rows: any[][] = [
    [{ text: "⏱ За 1 годину", callback_data: `snooze_pick:${reminderId}:1h` }],
  ];

  // Show "This evening" only if before 19:00
  if (hour < 19) {
    rows.push([{ text: "🌆 Сьогодні о 19:00", callback_data: `snooze_pick:${reminderId}:evening` }]);
  }

  rows.push([{ text: "🌅 Завтра о 07:00", callback_data: `snooze_pick:${reminderId}:tomorrow` }]);
  rows.push([{ text: "📅 Через тиждень", callback_data: `snooze_pick:${reminderId}:week` }]);
  rows.push([{ text: "✏️ Довільний час", callback_data: `snooze_pick:${reminderId}:custom` }]);

  // Guard: check if already resolved before showing snooze options
  const reminder = await snoozeUC.repo.findById(reminderId);
  if (!reminder) {
    await ctx.answerCallbackQuery("❌ Нагадування не знайдено.");
    return;
  }
  if (reminder.isResolved()) {
    await ctx.answerCallbackQuery("❌ Нагадування вже вирішено — дія неможлива.");
    return;
  }

  await ctx.reply("⏰ Відкласти на:", {
    reply_markup: { inline_keyboard: rows },
  });
}

export async function handleSnoozePick(
  ctx: MinimalCtx,
  snoozeUC: SnoozeReminder,
  reminderId: number,
  pick: string
): Promise<void> {
  const now = Date.now();
  let scheduledAt: number;
  const nowDate = new Date();

  if (pick === "1h") {
    scheduledAt = now + 60 * 60 * 1000;
  } else if (pick === "week") {
    scheduledAt = now + 7 * 24 * 60 * 60 * 1000;
  } else if (pick === "tomorrow") {
    const tomorrow = new Date(nowDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(7, 0, 0, 0);
    scheduledAt = tomorrow.getTime();
  } else {
    scheduledAt = now + 60 * 60 * 1000;
  }

  try {
    await snoozeUC.execute({ reminderId, newScheduledAtMs: scheduledAt });
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
