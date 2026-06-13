import type { ReminderRepository } from "../ports/reminder-repository.js";
import { ScheduledTime } from "../../domain/value-objects/scheduled-time.js";
import { AlreadyResolvedError } from "../../domain/errors.js";

export interface SnoozeReminderInput {
  reminderId: number;
  newScheduledAtMs: number;
}

export class SnoozeReminder {
  constructor(readonly repo: ReminderRepository) {}

  async execute(input: SnoozeReminderInput) {
    const reminder = await this.repo.findById(input.reminderId);
    if (!reminder) throw new Error(`Reminder ${input.reminderId} not found`);

    if (reminder.isResolved()) {
      throw new AlreadyResolvedError();
    }

    const time = ScheduledTime.from(input.newScheduledAtMs);
    reminder.snooze(time);
    await this.repo.update(reminder);
    return reminder;
  }
}
