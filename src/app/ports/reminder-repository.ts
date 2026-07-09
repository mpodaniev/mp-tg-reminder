import type { Reminder } from "../../domain/reminder.js";
import type { SourceSnapshot } from "../../domain/value-objects/source-snapshot.js";

export interface OwnerSettingsRow {
  id: 1;
  ownerTelegramId: number;
  timezone: string | null;
  createdAt: number;
}

export interface ReminderRepository {
  saveWithSnapshot(
    snapshot: Omit<SourceSnapshot, "id">,
    reminder: Reminder
  ): Promise<Reminder>;

  findById(id: number): Promise<Reminder | null>;

  findDuePending(nowMs: number): Promise<Reminder[]>;

  /**
   * All Visible (`pending`, `firing`, or `fired`, not yet explicitly deleted)
   * reminders, ordered by capture order (id ascending, ADR-0002). Backs the
   * widened /list read path (AC-01/AC-03/AC-08).
   */
  findVisibleOrdered(): Promise<Reminder[]>;

  findFiring(): Promise<Reminder[]>;

  findAwaitingOlderThan(cutoffMs: number): Promise<Reminder[]>;

  update(reminder: Reminder): Promise<void>;

  getOwnerSettings(): Promise<OwnerSettingsRow | null>;

  upsertOwnerSettings(
    ownerTelegramId: number,
    timezone: string | null
  ): Promise<void>;
}
