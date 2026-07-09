import type { ReminderRepository, OwnerSettingsRow } from "../../../ports/index.js";
import { Reminder } from "../../../../domain/reminder.js";
import type { SourceSnapshot } from "../../../../domain/value-objects/source-snapshot.js";

export class InMemoryReminderRepository implements ReminderRepository {
  reminders = new Map<number, Reminder>();
  private nextId = 1;

  constructor(
    private readonly ownerTelegramId: number,
    private readonly timezone: string | null
  ) {}

  async saveWithSnapshot(
    snapshot: Omit<SourceSnapshot, "id">,
    reminder: Reminder
  ): Promise<Reminder> {
    const id = this.nextId++;
    const snapshotWithId: SourceSnapshot = { ...snapshot, id };
    const saved = Reminder.reconstitute({
      id,
      snapshot: snapshotWithId,
      state: reminder.state,
      scheduledAt: reminder.scheduledAt,
      firedAt: reminder.firedAt,
      deliveredAt: reminder.deliveredAt,
      firedMessageId: reminder.firedMessageId,
      createdAt: reminder.createdAt,
    });
    this.reminders.set(id, saved);
    return saved;
  }

  async findById(id: number): Promise<Reminder | null> {
    return this.reminders.get(id) ?? null;
  }

  async findDuePending(nowMs: number): Promise<Reminder[]> {
    return [...this.reminders.values()].filter(
      (r) =>
        r.state === "pending" &&
        r.scheduledAt !== null &&
        r.scheduledAt <= nowMs
    );
  }

  async findVisibleOrdered(): Promise<Reminder[]> {
    return [...this.reminders.values()]
      .filter((r) => r.state === "pending" || r.state === "fired")
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  }

  async findFiring(): Promise<Reminder[]> {
    return [...this.reminders.values()].filter((r) => r.state === "firing");
  }

  async findAwaitingOlderThan(cutoffMs: number): Promise<Reminder[]> {
    return [...this.reminders.values()].filter(
      (r) => r.state === "awaiting_time" && r.createdAt < cutoffMs
    );
  }

  async update(reminder: Reminder): Promise<void> {
    if (reminder.id === undefined) throw new Error("Cannot update reminder without id");
    this.reminders.set(reminder.id, reminder);
  }

  async getOwnerSettings(): Promise<OwnerSettingsRow | null> {
    return {
      id: 1,
      ownerTelegramId: this.ownerTelegramId,
      timezone: this.timezone,
      createdAt: Date.now(),
    };
  }

  async upsertOwnerSettings(ownerTelegramId: number, timezone: string): Promise<void> {
    // in-memory — no-op for tests that just need the call to succeed
  }
}
