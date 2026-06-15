import type { ReminderRepository } from "../../app/ports/reminder-repository.js";
import type {
  ListActiveReminders,
  ActiveListViewModel,
} from "../../app/use-cases/list-active-reminders.js";
import { isOwner } from "../middleware/auth-middleware.js";
import { LIST_CALLBACK } from "../dto/index.js";

type MinimalCtx = {
  from?: { id: number };
  reply: (text: string, opts?: any) => Promise<any>;
};

const EMPTY_MESSAGE = "📭 Немає активних нагадувань.";

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
