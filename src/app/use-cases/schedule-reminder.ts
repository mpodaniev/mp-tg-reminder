import type { ReminderRepository } from "../ports/reminder-repository.js";
import { ScheduledTime } from "../../domain/value-objects/scheduled-time.js";

export interface ScheduleReminderInput {
  reminderId: number;
  scheduledAtMs: number;
}

export class ScheduleReminder {
  constructor(private readonly repo: ReminderRepository) {}

  async execute(input: ScheduleReminderInput) {
    const reminder = await this.repo.findById(input.reminderId);
    if (!reminder) throw new Error(`Reminder ${input.reminderId} not found`);

    const time = ScheduledTime.from(input.scheduledAtMs);
    reminder.schedule(time);
    await this.repo.update(reminder);
    return reminder;
  }
}
