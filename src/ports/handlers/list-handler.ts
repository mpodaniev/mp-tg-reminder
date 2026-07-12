import type { ReminderRepository } from "../../app/ports/reminder-repository.js";
import type {
  ListActiveReminders,
  ActiveListViewModel,
} from "../../app/use-cases/list-active-reminders.js";
import type { CancelPendingReminder } from "../../app/use-cases/cancel-pending-reminder.js";
import type { ResolveReminder } from "../../app/use-cases/resolve-reminder.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";
import { InvalidStateTransitionError, ReminderNotFoundError } from "../../domain/errors.js";
import { isOwner } from "../middleware/auth-middleware.js";
import { LIST_CALLBACK } from "../dto/index.js";
import { cleanupFiredNotification } from "./resolve-handler.js";

type MinimalCtx = {
  from?: { id: number };
  reply: (text: string, opts?: any) => Promise<any>;
};

type MinimalCallbackCtx = {
  answerCallbackQuery: (text?: string) => Promise<any>;
  reply: (text: string, opts?: any) => Promise<any>;
  callbackQuery?: { message?: { message_id: number } };
};

const EMPTY_MESSAGE = "📭 Немає активних нагадувань.";
const CANCEL_CONFIRM_MESSAGE = "✅ Нагадування скасовано.";
const DELETE_CONFIRM_MESSAGE = "✅ Нагадування видалено.";
// Uniform reply for every non-pending end state — the list is a point-in-time
// snapshot, so a tap on an entry that has since changed state is a safe no-op (AC-04).
const NOT_ACTIVE_MESSAGE = "⚠️ Це нагадування більше не активне.";

function formatFireTime(scheduledAtMs: number, timezone: string): string {
  return new Intl.DateTimeFormat("uk", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(scheduledAtMs));
}

function renderListMessage(
  vm: ActiveListViewModel,
  timezone: string
): { text: string; inlineKeyboard: any[][] } {
  const lines: string[] = ["📋 Активні нагадування:", ""];
  const inlineKeyboard: any[][] = [];

  vm.rows.forEach((row, i) => {
    const n = i + 1;
    const statusFlag = row.status === "fired" ? "🔔 спрацювало" : "🕒 заплановано";
    lines.push(
      `${n}. ${row.preview} — ${formatFireTime(row.fireTimeMs, timezone)} (${statusFlag})`
    );
    // Cancel only makes sense on a still-scheduled reminder — a fired one has
    // nothing left to cancel (AC-05). A fired reminder instead offers Delete
    // directly from the list, reusing the same resolve path as the
    // fired-message button, so the Owner never has to go hunt that message
    // down in chat just to clear the list (AC-09, added-by-fix).
    const rowButtons: any[] = [];
    if (row.status === "scheduled") {
      rowButtons.push({
        text: `🗑 Скасувати #${n}`,
        callback_data: `${LIST_CALLBACK.CANCEL}:${row.reminderId}`,
      });
    } else {
      rowButtons.push({
        text: `🗑 Видалити #${n}`,
        callback_data: `${LIST_CALLBACK.DELETE}:${row.reminderId}`,
      });
    }
    rowButtons.push({
      text: `🔗 Джерело #${n}`,
      callback_data: `${LIST_CALLBACK.SOURCE}:${row.reminderId}`,
    });
    inlineKeyboard.push(rowButtons);
  });

  if (vm.overflowCount > 0) {
    lines.push("");
    lines.push(`… ще ${vm.overflowCount}`);
  }

  return { text: lines.join("\n"), inlineKeyboard };
}

/**
 * Re-runs the Active-list query and edits an existing /list message in place
 * with the fresh result — used after the Owner's own Cancel/Delete tap on
 * that message (issue #8). Best-effort: an edit failure (e.g. Telegram's
 * edit window) is logged and swallowed, never thrown, since the caller has
 * already sent a confirmation reply that must stand on its own.
 */
export async function refreshListMessage(
  gateway: TelegramGateway,
  listUC: ListActiveReminders,
  repo: ReminderRepository,
  chatId: number,
  messageId: number
): Promise<void> {
  try {
    const vm = await listUC.execute();
    if (vm.isEmpty) {
      await gateway.editListMessage(chatId, messageId, EMPTY_MESSAGE, null);
      return;
    }
    const settings = await repo.getOwnerSettings();
    const timezone = settings?.timezone ?? "UTC";
    const { text, inlineKeyboard } = renderListMessage(vm, timezone);
    await gateway.editListMessage(chatId, messageId, text, inlineKeyboard);
  } catch (err) {
    console.warn({ module: "list", event: "refresh_failed", error: String(err) });
  }
}

/**
 * /list command handler: renders the Active list as a single message (AC-01 /
 * AC-08) or the empty-state message (AC-02) for the Owner only (AC-05). Sends
 * exactly one bot message regardless of reminder count (sad §6 send-count = 1).
 */
export async function handleList(
  ctx: MinimalCtx,
  repo: ReminderRepository,
  listUC: ListActiveReminders
): Promise<void> {
  if (!(await isOwner(ctx.from?.id, repo))) return;

  // Structured timing log around the list use-case — the p95 ≤ 1000 ms
  // verification leaf (spec §6 Latency / sad §8 Observability / QG-3).
  const startedAt = Date.now();
  const vm = await listUC.execute();
  console.info({
    module: "list",
    event: "list_rendered",
    elapsedMs: Date.now() - startedAt,
    rows: vm.rows.length,
    overflow: vm.overflowCount,
  });

  if (vm.isEmpty) {
    await ctx.reply(EMPTY_MESSAGE);
    return;
  }

  const settings = await repo.getOwnerSettings();
  const timezone = settings?.timezone ?? "UTC";
  const { text, inlineKeyboard } = renderListMessage(vm, timezone);

  await ctx.reply(text, { reply_markup: { inline_keyboard: inlineKeyboard } });
}

/**
 * Cancel callback from the Active list. On success the reminder moves
 * pending→deleted, the Owner is confirmed in a separate message, then the
 * tapped /list message itself is refreshed in place to drop the row
 * (issue #8 — supersedes ADR-0002's default for the Owner's own action, see
 * that ADR's Update note). A tap on a reminder that is no longer pending
 * surfaces the uniform no-op (AC-03 / AC-04) without any refresh.
 */
export async function handleListCancel(
  ctx: MinimalCallbackCtx,
  cancelUC: CancelPendingReminder,
  gateway: TelegramGateway,
  repo: ReminderRepository,
  listUC: ListActiveReminders,
  reminderId: number,
  ownerChatId: number
): Promise<void> {
  try {
    await cancelUC.execute({ reminderId });
    await ctx.answerCallbackQuery();
    await ctx.reply(CANCEL_CONFIRM_MESSAGE);
  } catch (err) {
    // A non-pending state (sentinel) or a since-purged row both mean the entry
    // is no longer Active — uniform no-op, never a crash (AC-04 / ADR-0002).
    if (
      err instanceof InvalidStateTransitionError ||
      err instanceof ReminderNotFoundError
    ) {
      await ctx.answerCallbackQuery();
      await ctx.reply(NOT_ACTIVE_MESSAGE);
      return;
    }
    throw err;
  }

  const messageId = ctx.callbackQuery?.message?.message_id;
  if (messageId !== undefined) {
    await refreshListMessage(gateway, listUC, repo, ownerChatId, messageId);
  }
}

/**
 * Delete callback from the Active list, for an already-fired row. On success
 * the reminder moves fired→deleted, the original fired-notification message
 * is cleaned up, the Owner is confirmed, then the tapped /list message is
 * refreshed in place to drop the row (issue #8). Routed separately from the
 * fired-notification's own Delete button (`action: "delete"`, handled by
 * `handleResolve`) via the distinct `list_delete` callback — see
 * `src/ports/dto/index.ts`.
 */
export async function handleListDelete(
  ctx: MinimalCallbackCtx,
  resolveUC: ResolveReminder,
  gateway: TelegramGateway,
  repo: ReminderRepository,
  listUC: ListActiveReminders,
  reminderId: number,
  ownerChatId: number
): Promise<void> {
  let reminder;
  try {
    reminder = await resolveUC.execute({ reminderId, action: "delete" });
  } catch (err) {
    if (
      err instanceof InvalidStateTransitionError ||
      err instanceof ReminderNotFoundError
    ) {
      await ctx.answerCallbackQuery();
      await ctx.reply(NOT_ACTIVE_MESSAGE);
      return;
    }
    throw err;
  }

  await cleanupFiredNotification(gateway, ownerChatId, reminder.firedMessageId);

  await ctx.answerCallbackQuery();
  await ctx.reply(DELETE_CONFIRM_MESSAGE);

  const messageId = ctx.callbackQuery?.message?.message_id;
  if (messageId !== undefined) {
    await refreshListMessage(gateway, listUC, repo, ownerChatId, messageId);
  }
}
