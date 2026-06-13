import type { ReminderRepository } from "../app/ports/reminder-repository.js";
import type { TelegramGateway } from "../app/ports/telegram-gateway.js";
import { CaptureMessage } from "../app/use-cases/capture-message.js";
import { ScheduleReminder } from "../app/use-cases/schedule-reminder.js";
import { SnoozeReminder } from "../app/use-cases/snooze-reminder.js";
import { ResolveReminder } from "../app/use-cases/resolve-reminder.js";
import { handleForwardedMessage } from "./conversations/capture-conversation.js";
import { handleSettings } from "./handlers/settings-handler.js";
import { handleSnooze } from "./handlers/snooze-handler.js";
import { handleResolve } from "./handlers/resolve-handler.js";
import { handleSource } from "./handlers/source-handler.js";

export function buildRouter(
  repo: ReminderRepository,
  gateway: TelegramGateway,
  ownerChatId: number
) {
  const captureUC = new CaptureMessage(repo);
  const scheduleUC = new ScheduleReminder(repo);
  const snoozeUC = new SnoozeReminder(repo);
  const resolveUC = new ResolveReminder(repo);

  return {
    async handleUpdate(ctx: any) {
      const msg = ctx.message;

      if (msg?.text?.startsWith("/settings")) {
        return handleSettings(ctx, repo);
      }

      if (msg?.forward_origin || msg?.forward_date || msg?.forward_from || msg?.forward_from_chat) {
        return handleForwardedMessage(ctx, captureUC, scheduleUC);
      }

      if (ctx.callbackQuery) {
        const data: string = ctx.callbackQuery.data ?? "";
        const [action, idStr] = data.split(":");
        const reminderId = parseInt(idStr, 10);

        if (action === "snooze") {
          return handleSnooze(ctx, snoozeUC, reminderId);
        }
        if (action === "done" || action === "delete") {
          return handleResolve(ctx, resolveUC, gateway, reminderId, action as "done" | "delete", ownerChatId);
        }
        if (action === "source") {
          return handleSource(ctx, repo, gateway, reminderId, ownerChatId);
        }
        if (action === "qpick") {
          return handleQuickPick(ctx, scheduleUC, idStr);
        }
      }
    },
  };
}

async function handleQuickPick(ctx: any, scheduleUC: ScheduleReminder, dataStr: string): Promise<void> {
  const parts = dataStr.split(":");
  const reminderId = parseInt(parts[0], 10);
  const pick = parts[1];

  const now = Date.now();
  let scheduledAt: number;

  if (pick === "1h") {
    scheduledAt = now + 60 * 60 * 1000;
  } else if (pick === "week") {
    scheduledAt = now + 7 * 24 * 60 * 60 * 1000;
  } else {
    await ctx.answerCallbackQuery?.("Невідомий quick-pick");
    return;
  }

  await scheduleUC.execute({ reminderId, scheduledAtMs: scheduledAt });
  await ctx.answerCallbackQuery?.("✅ Нагадування заплановано");
  await ctx.reply?.("✅ Нагадування заплановано!");
}
