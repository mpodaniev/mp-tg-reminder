import type { ReminderRepository } from "../app/ports/reminder-repository.js";
import type { TelegramGateway } from "../app/ports/telegram-gateway.js";
import { ScheduleReminder } from "../app/use-cases/schedule-reminder.js";
import { SnoozeReminder } from "../app/use-cases/snooze-reminder.js";
import { ResolveReminder } from "../app/use-cases/resolve-reminder.js";
import { CaptureMessage } from "../app/use-cases/capture-message.js";
import { handleForwardedMessage, handlePlainTextMessage } from "./conversations/capture-conversation.js";
import { handleSettings } from "./handlers/settings-handler.js";
import { handleSnooze, handleSnoozePick } from "./handlers/snooze-handler.js";
import { handleResolve } from "./handlers/resolve-handler.js";
import { handleSource } from "./handlers/source-handler.js";
import { handleList, handleListCancel, handleListDelete } from "./handlers/list-handler.js";
import { ListActiveReminders } from "../app/use-cases/list-active-reminders.js";
import { CancelPendingReminder } from "../app/use-cases/cancel-pending-reminder.js";
import { GetStats } from "../app/use-cases/get-stats.js";
import { handleStats } from "./handlers/stats-handler.js";
import { localTodayAt } from "./tz-utils.js";
import { AlreadyResolvedError, InvalidStateTransitionError, ReminderNotFoundError } from "../domain/errors.js";
import { isOwner } from "./middleware/auth-middleware.js";
import type { PendingPromptRepository, PendingPromptRow } from "../app/ports/pending-prompt-repository.js";

// Uniform reply for a stale schedule attempt (quick-pick or custom time) on a
// reminder that is no longer awaiting_time — mirrors list-handler's ADR-0002
// no-op pattern so a stale tap never escapes to bot.catch.
const NOT_ACTIVE_MESSAGE = "⚠️ Це нагадування більше не активне.";

// AC-03: appended when the chosen time falls sooner than the configured wake
// interval — an estimate for the ordinary case, not a guarantee (AC-07 covers
// a missed wake cycle delaying it further, but never losing it).
const DELIVERY_MAY_BE_LATE_NOTE =
  "\n⏳ Під час звичайної роботи доставка може запізнитися до одного інтервалу пробудження.";

export function buildRouter(
  repo: ReminderRepository,
  gateway: TelegramGateway,
  ownerChatId: number,
  pendingPromptRepo: PendingPromptRepository,
  wakeIntervalMs?: number
) {
  const captureUC = new CaptureMessage(repo);
  // The wake interval driving the AC-03 delay estimate is threaded from the
  // composition root so it tracks the deployed external cron cadence rather
  // than a compile-time constant; falls back to ScheduleReminder's default.
  const scheduleUC = new ScheduleReminder(repo, wakeIntervalMs);
  const snoozeUC = new SnoozeReminder(repo);
  const resolveUC = new ResolveReminder(repo);
  const listUC = new ListActiveReminders(repo);
  const cancelUC = new CancelPendingReminder(repo);
  const statsUC = new GetStats(repo);

  return {
    async handleUpdate(ctx: any) {
      // Single Owner-auth gate for every path (ADR-0003, AC-04b) — a non-Owner
      // sender is denied here, before any handler dispatch, so a future handler
      // is Owner-gated by construction instead of needing its own check.
      const senderId: number | undefined = ctx.from?.id ?? ctx.message?.from?.id;
      if (!(await isOwner(senderId, repo))) {
        return;
      }

      const msg = ctx.message;

      if (msg?.text?.startsWith("/settings")) {
        return handleSettings(ctx, repo);
      }

      if (msg?.text?.startsWith("/list")) {
        return handleList(ctx, repo, listUC);
      }

      if (msg?.text?.startsWith("/stats")) {
        return handleStats(ctx, statsUC);
      }

      if (msg?.forward_origin || msg?.forward_date || msg?.forward_from || msg?.forward_from_chat) {
        return handleForwardedMessage(ctx, captureUC);
      }

      // Handle pending custom-time text input — pending_prompt is a durable
      // singleton (data-model.md: only one Owner exists), so no per-sender key
      // is needed once the gate above has already confirmed the sender is Owner.
      if (msg?.text) {
        const pending = await pendingPromptRepo.findPendingPrompt();
        if (pending) {
          return handleCustomTimeInput(ctx, scheduleUC, snoozeUC, repo, gateway, ownerChatId, pendingPromptRepo, pending);
        }

        // AC-04/AC-05: plain-typed capture — only once a pending time-request
        // and every recognized command have already been ruled out above.
        // Command-shaped text (even unrecognized) and empty/whitespace-only
        // text never start a new capture.
        const trimmed = msg.text.trim();
        if (trimmed.length > 0 && !trimmed.startsWith("/")) {
          return handlePlainTextMessage(ctx, captureUC);
        }
        return;
      }

      if (ctx.callbackQuery) {
        const data: string = ctx.callbackQuery.data ?? "";
        const parts = data.split(":");
        const action = parts[0];
        const reminderId = parseInt(parts[1] ?? "", 10);
        const pick = parts[2];

        if (action === "snooze") {
          return handleSnooze(ctx, snoozeUC, repo, reminderId);
        }
        if (action === "snooze_pick") {
          if (pick === "custom") {
            await pendingPromptRepo.savePendingPrompt({ type: "snooze", reminderId, createdAt: Date.now() });
            await ctx.answerCallbackQuery?.();
            await ctx.reply?.("✏️ Введіть бажаний час (наприклад: за 2 год, завтра 15:00, 20.06.2026 09:00):");
            return;
          }
          return handleSnoozePick(ctx, snoozeUC, repo, reminderId, pick, gateway, ownerChatId);
        }
        if (action === "done" || action === "delete") {
          return handleResolve(ctx, resolveUC, gateway, reminderId, action as "done" | "delete", ownerChatId);
        }
        if (action === "list_delete") {
          return handleListDelete(ctx, resolveUC, gateway, repo, listUC, reminderId, ownerChatId);
        }
        if (action === "cancel") {
          return handleListCancel(ctx, cancelUC, gateway, repo, listUC, reminderId, ownerChatId);
        }
        if (action === "source") {
          return handleSource(ctx, repo, gateway, reminderId, ownerChatId);
        }
        if (action === "qpick") {
          return handleQuickPick(ctx, scheduleUC, repo, reminderId, pick, ownerChatId, pendingPromptRepo);
        }
      }
    },
  };
}

async function handleQuickPick(
  ctx: any,
  scheduleUC: ScheduleReminder,
  repo: ReminderRepository,
  reminderId: number,
  pick: string,
  ownerChatId: number,
  pendingPromptRepo: PendingPromptRepository
): Promise<void> {
  if (pick === "custom") {
    await pendingPromptRepo.savePendingPrompt({ type: "capture", reminderId, createdAt: Date.now() });
    await ctx.answerCallbackQuery?.();
    await ctx.reply?.("✏️ Введіть бажаний час (наприклад: за 2 год, завтра 15:00, 20.06.2026 09:00):");
    return;
  }

  const settings = await repo.getOwnerSettings();
  const timezone = settings?.timezone ?? "UTC";
  const now = Date.now();
  let scheduledAt: number;

  if (pick === "1h") {
    scheduledAt = now + 60 * 60 * 1000;
  } else if (pick === "week") {
    scheduledAt = now + 7 * 24 * 60 * 60 * 1000;
  } else if (pick === "evening") {
    scheduledAt = localTodayAt(timezone, 19, 0, 0);
  } else if (pick === "tomorrow") {
    scheduledAt = localTodayAt(timezone, 7, 0, 1);
  } else {
    await ctx.answerCallbackQuery?.("Невідомий quick-pick");
    return;
  }

  let deliveryMayBeLate: boolean;
  try {
    ({ deliveryMayBeLate } = await scheduleUC.execute({ reminderId, scheduledAtMs: scheduledAt }));
  } catch (err) {
    if (err instanceof InvalidStateTransitionError || err instanceof ReminderNotFoundError) {
      await ctx.answerCallbackQuery?.();
      await ctx.reply?.(NOT_ACTIVE_MESSAGE);
      return;
    }
    throw err;
  }

  const formatted = new Intl.DateTimeFormat("uk", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(scheduledAt));

  await ctx.answerCallbackQuery?.("✅ Нагадування заплановано");
  await ctx.reply?.(
    `✅ Нагадування заплановано на ${formatted}${deliveryMayBeLate ? DELIVERY_MAY_BE_LATE_NOTE : ""}`
  );
}

async function handleCustomTimeInput(
  ctx: any,
  scheduleUC: ScheduleReminder,
  snoozeUC: SnoozeReminder,
  repo: ReminderRepository,
  gateway: TelegramGateway,
  ownerChatId: number,
  pendingPromptRepo: PendingPromptRepository,
  pending: PendingPromptRow
): Promise<void> {
  await pendingPromptRepo.clearPendingPrompt();

  const text: string = ctx.message?.text ?? "";
  const settings = await repo.getOwnerSettings();
  const timezone = settings?.timezone ?? "UTC";

  const scheduledAt = parseCustomTime(text, timezone);
  if (scheduledAt === null) {
    await pendingPromptRepo.savePendingPrompt(pending);
    await ctx.reply?.("❌ Не вдалося розпізнати час. Спробуйте: «за 2 год», «завтра 15:00», «20.06.2026 09:00»");
    return;
  }

  if (scheduledAt <= Date.now()) {
    await pendingPromptRepo.savePendingPrompt(pending);
    await ctx.reply?.("❌ Час нагадування повинен бути у майбутньому. Введіть інший час:");
    return;
  }

  const formatted = new Intl.DateTimeFormat("uk", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(scheduledAt));

  if (pending.type === "capture") {
    try {
      const { deliveryMayBeLate } = await scheduleUC.execute({
        reminderId: pending.reminderId,
        scheduledAtMs: scheduledAt,
      });
      await ctx.reply?.(
        `✅ Нагадування заплановано на ${formatted}${deliveryMayBeLate ? DELIVERY_MAY_BE_LATE_NOTE : ""}`
      );
    } catch (err) {
      if (err instanceof InvalidStateTransitionError || err instanceof ReminderNotFoundError) {
        await ctx.reply?.(NOT_ACTIVE_MESSAGE);
        return;
      }
      throw err;
    }
  } else {
    try {
      const reminder = await repo.findById(pending.reminderId);
      const firedMessageId = reminder?.firedMessageId ?? null;
      await snoozeUC.execute({ reminderId: pending.reminderId, newScheduledAtMs: scheduledAt });
      if (firedMessageId !== null) {
        await gateway.editMessageToPlaceholder(ownerChatId, firedMessageId, `⏰ Відкладено до ${formatted}`);
      }
      await ctx.reply?.(`✅ Нагадування відкладено до ${formatted}`);
    } catch (err) {
      if (err instanceof AlreadyResolvedError) {
        await ctx.reply?.("❌ Нагадування вже вирішено — дія неможлива.");
        return;
      }
      throw err;
    }
  }
}

export function parseCustomTime(text: string, timezone: string): number | null {
  const s = text.trim().toLowerCase();

  // Relative: "за N год[ин]" or "за N хв"
  const hoursMatch = s.match(/^за\s+(\d+)\s*год/);
  if (hoursMatch) {
    return Date.now() + parseInt(hoursMatch[1]!, 10) * 60 * 60 * 1000;
  }
  const minsMatch = s.match(/^за\s+(\d+)\s*хв/);
  if (minsMatch) {
    return Date.now() + parseInt(minsMatch[1]!, 10) * 60 * 1000;
  }

  // "завтра HH:MM"
  const tomorrowMatch = s.match(/^завтра\s+(\d{1,2}):(\d{2})$/);
  if (tomorrowMatch) {
    const h = parseInt(tomorrowMatch[1]!, 10);
    const m = parseInt(tomorrowMatch[2]!, 10);
    if (h > 23 || m > 59) return null;
    return localTodayAt(timezone, h, m, 1);
  }

  // "DD.MM.YYYY HH:MM" or "DD.MM.YYYY" (defaults to 09:00)
  const fullMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (fullMatch) {
    const day = parseInt(fullMatch[1]!, 10);
    const month = parseInt(fullMatch[2]!, 10);
    const year = parseInt(fullMatch[3]!, 10);
    const h = fullMatch[4] !== undefined ? parseInt(fullMatch[4]!, 10) : 9;
    const m = fullMatch[5] !== undefined ? parseInt(fullMatch[5]!, 10) : 0;
    if (month < 1 || month > 12 || day < 1 || day > 31 || h > 23 || m > 59) return null;
    const offsetMs = getUtcOffsetMsForDate(timezone, year, month - 1, day);
    return Date.UTC(year, month - 1, day, h, m, 0, 0) - offsetMs;
  }

  // "HH:MM" — next occurrence of that time today or tomorrow
  const timeOnlyMatch = s.match(/^(\d{1,2}):(\d{2})$/);
  if (timeOnlyMatch) {
    const h = parseInt(timeOnlyMatch[1]!, 10);
    const m = parseInt(timeOnlyMatch[2]!, 10);
    if (h > 23 || m > 59) return null;
    const todayMs = localTodayAt(timezone, h, m, 0);
    return todayMs > Date.now() ? todayMs : localTodayAt(timezone, h, m, 1);
  }

  return null;
}

function getUtcOffsetMsForDate(timezone: string, year: number, month0: number, day: number): number {
  const probe = new Date(Date.UTC(year, month0, day, 12, 0, 0, 0));
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(probe);
  return new Date(local.replace(", ", "T") + "Z").getTime() - probe.getTime();
}
