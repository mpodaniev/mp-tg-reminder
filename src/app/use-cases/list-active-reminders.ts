import type { ReminderRepository } from "../ports/reminder-repository.js";
import type { Reminder } from "../../domain/reminder.js";

/** Fixed cap on rows rendered in a single Active-list message (ADR-0003). */
export const MAX_ACTIVE_LIST_ROWS = 50;
/** Telegram hard limit on a single message body (ADR-0003 / sad §2). */
export const TELEGRAM_MESSAGE_CHAR_LIMIT = 4096;
/** First-line preview cap per row (AC-01, "up to ~100 characters"). */
export const PREVIEW_MAX_CHARS = 100;
/** Per-row chrome charged against the char budget (fire-time line + numbering). */
const PER_ROW_OVERHEAD_CHARS = 40;

export type ReminderVisibleStatus = "scheduled" | "fired";

export interface ActiveReminderRow {
  reminderId: number;
  preview: string;
  fireTimeMs: number;
  /** Whether this reminder is still scheduled or has already fired (AC-02). */
  status: ReminderVisibleStatus;
}

export interface ActiveListViewModel {
  rows: ActiveReminderRow[];
  /** Reminders that fit no longer (M in the "… ще M" indicator); 0 when all fit. */
  overflowCount: number;
  /** True only when there are no Active reminders at all (AC-02). */
  isEmpty: boolean;
}

export function buildPreview(text: string | null): string {
  const firstLine = (text ?? "[медіа]").split("\n")[0] ?? "";
  if (firstLine.length <= PREVIEW_MAX_CHARS) return firstLine;
  return firstLine.slice(0, PREVIEW_MAX_CHARS - 1) + "…";
}

function toRow(reminder: Reminder): ActiveReminderRow {
  return {
    reminderId: reminder.id!,
    preview: buildPreview(reminder.snapshot.messageText),
    fireTimeMs: reminder.scheduledAt ?? 0,
    // A "firing" reminder has already fired (delivery is retrying, ADR-0005) —
    // it reads as "fired" to the Owner, not "scheduled" (AC-02, AC-04).
    status: reminder.state === "pending" ? "scheduled" : "fired",
  };
}

/**
 * Keep the earliest-added (capture-order, ADR-0002) rows that fit one message:
 * bounded by both the fixed row cap and the 4096-char budget — whichever bites
 * first (ADR-0003). The first row is always kept so a single oversized reminder
 * still renders. Relies on `allRows` already being in capture order.
 */
function truncateToFit(allRows: ActiveReminderRow[]): {
  rows: ActiveReminderRow[];
  overflowCount: number;
} {
  const kept: ActiveReminderRow[] = [];
  let chars = 0;
  for (const row of allRows) {
    if (kept.length >= MAX_ACTIVE_LIST_ROWS) break;
    const rowChars = row.preview.length + PER_ROW_OVERHEAD_CHARS;
    if (kept.length > 0 && chars + rowChars > TELEGRAM_MESSAGE_CHAR_LIMIT) break;
    kept.push(row);
    chars += rowChars;
  }
  return { rows: kept, overflowCount: allRows.length - kept.length };
}

export class ListActiveReminders {
  constructor(private readonly repo: ReminderRepository) {}

  async execute(): Promise<ActiveListViewModel> {
    const reminders = await this.repo.findVisibleOrdered();
    const allRows = reminders.map(toRow);
    const { rows, overflowCount } = truncateToFit(allRows);
    return { rows, overflowCount, isEmpty: allRows.length === 0 };
  }
}
