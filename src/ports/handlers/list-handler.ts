import type { ReminderRepository } from "../../app/ports/reminder-repository.js";
import type {
  ListActiveReminders,
  ActiveListViewModel,
} from "../../app/use-cases/list-active-reminders.js";
import type { CancelPendingReminder } from "../../app/use-cases/cancel-pending-reminder.js";
import { InvalidStateTransitionError, ReminderNotFoundError } from "../../domain/errors.js";
import { isOwner } from "../middleware/auth-middleware.js";
import { LIST_CALLBACK } from "../dto/index.js";

type MinimalCtx = {
  from?: { id: number };
  reply: (text: string, opts?: any) => Promise<any>;
};

type MinimalCallbackCtx = {
  answerCallbackQuery: (text?: string) => Promise<any>;
  reply: (text: string, opts?: any) => Promise<any>;
};

const EMPTY_MESSAGE = "📭 Немає активних нагадувань.";
const CANCEL_CONFIRM_MESSAGE = "✅ Нагадування скасовано.";
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
    lines.push(`${n}. ${row.preview} — ${formatFireTime(row.fireTimeMs, timezone)}`);
    inlineKeyboard.push([
      { text: `🗑 Скасувати #${n}`, callback_data: `${LIST_CALLBACK.CANCEL}:${row.reminderId}` },
      { text: `🔗 Джерело #${n}`, callback_data: `${LIST_CALLBACK.SOURCE}:${row.reminderId}` },
    ]);
  });

  if (vm.overflowCount > 0) {
    lines.push("");
    lines.push(`… ще ${vm.overflowCount}`);
  }

  return { text: lines.join("\n"), inlineKeyboard };
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

  const vm = await listUC.execute();
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
 * pending→deleted and the Owner is confirmed in a separate message; the rendered
 * list message is never edited (immutable snapshot, ADR-0002). A tap on a
 * reminder that is no longer pending surfaces the uniform no-op (AC-03 / AC-04).
 */
export async function handleListCancel(
  ctx: MinimalCallbackCtx,
  cancelUC: CancelPendingReminder,
  reminderId: number
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
}
