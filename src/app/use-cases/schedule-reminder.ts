import type { ReminderRepository } from "../ports/reminder-repository.js";
import { Reminder } from "../../domain/reminder.js";
import { ScheduledTime } from "../../domain/value-objects/scheduled-time.js";
import { ReminderNotFoundError } from "../../domain/errors.js";

export interface ScheduleReminderInput {
  reminderId: number;
  scheduledAtMs: number;
}

export interface ScheduleReminderResult {
  reminder: Reminder;
  // true when the chosen time falls sooner than the configured wake interval —
  // under normal operation delivery may then arrive up to one wake interval
  // late (AC-03), an estimate for the ordinary case, not a guarantee.
  deliveryMayBeLate: boolean;
}

const DEFAULT_WAKE_INTERVAL_MS = 3 * 60 * 1000; // sad.md §8: wake interval = 3 minutes

export class ScheduleReminder {
  constructor(
    private readonly repo: ReminderRepository,
    private readonly wakeIntervalMs: number = DEFAULT_WAKE_INTERVAL_MS
  ) {}

  async execute(input: ScheduleReminderInput): Promise<ScheduleReminderResult> {
    const reminder = await this.repo.findById(input.reminderId);
    if (!reminder) throw new ReminderNotFoundError(input.reminderId);

    const time = ScheduledTime.from(input.scheduledAtMs);
    reminder.schedule(time);
    await this.repo.update(reminder);

    const deliveryMayBeLate = input.scheduledAtMs - Date.now() < this.wakeIntervalMs;
    return { reminder, deliveryMayBeLate };
  }
}
