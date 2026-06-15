import type { ReminderRepository } from "../ports/reminder-repository.js";
import type { Reminder } from "../../domain/reminder.js";

export interface CancelPendingReminderInput {
  reminderId: number;
}

/**
 * Cancel an Active (pending) reminder from the /list view: load by id, apply the
 * pending→deleted transition, persist. Any non-pending state makes
 * `Reminder.cancel()` throw InvalidStateTransitionError, which is surfaced
 * unchanged (no persist, no further change) for the handler to map to the
 * uniform "no longer active" reply (AC-03 / AC-04).
 */
export class CancelPendingReminder {
  constructor(private readonly repo: ReminderRepository) {}

  async execute(input: CancelPendingReminderInput): Promise<Reminder> {
    const reminder = await this.repo.findById(input.reminderId);
    if (!reminder) throw new Error(`Reminder ${input.reminderId} not found`);

    reminder.cancel();
    await this.repo.update(reminder);
    return reminder;
  }
}
