import type { ReminderRepository } from "../ports/reminder-repository.js";
import type { Reminder } from "../../domain/reminder.js";
import { ReminderNotFoundError } from "../../domain/errors.js";

export interface CancelPendingReminderInput {
  reminderId: number;
}

/**
 * Cancel an Active (pending) reminder from the /list view: load by id, apply the
 * pending→deleted transition, persist. Any non-pending state makes
 * `Reminder.cancel()` throw InvalidStateTransitionError, which is surfaced
 * unchanged (no persist, no further change) for the handler to map to the
 * uniform "no longer active" reply (AC-03 / AC-04). A since-purged row (findById
 * → null) raises the typed ReminderNotFoundError, which the handler maps to the
 * same uniform no-op — a stale tap must never escape to bot.catch (ADR-0002).
 */
export class CancelPendingReminder {
  constructor(private readonly repo: ReminderRepository) {}

  async execute(input: CancelPendingReminderInput): Promise<Reminder> {
    const reminder = await this.repo.findById(input.reminderId);
    if (!reminder) throw new ReminderNotFoundError(input.reminderId);

    reminder.cancel();
    await this.repo.update(reminder);
    return reminder;
  }
}
