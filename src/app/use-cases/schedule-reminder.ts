import type { ReminderRepository } from "../ports/reminder-repository.js";
import { ScheduledTime } from "../../domain/value-objects/scheduled-time.js";
import { ReminderNotFoundError } from "../../domain/errors.js";

export interface ScheduleReminderInput {
  reminderId: number;
  scheduledAtMs: number;
}

export class ScheduleReminder {
  constructor(private readonly repo: ReminderRepository) {}

  async execute(input: ScheduleReminderInput) {
    const reminder = await this.repo.findById(input.reminderId);
    if (!reminder) throw new ReminderNotFoundError(input.reminderId);

    const time = ScheduledTime.from(input.scheduledAtMs);
    reminder.schedule(time);
    await this.repo.update(reminder);
    return reminder;
  }
}
