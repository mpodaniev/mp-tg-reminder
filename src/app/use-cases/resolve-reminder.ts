import type { ReminderRepository } from "../ports/reminder-repository.js";
import { InvalidStateTransitionError } from "../../domain/errors.js";

export interface ResolveReminderInput {
  reminderId: number;
  action: "done" | "delete";
}

export class ResolveReminder {
  constructor(private readonly repo: ReminderRepository) {}

  async execute(input: ResolveReminderInput) {
    const reminder = await this.repo.findById(input.reminderId);
    if (!reminder) throw new Error(`Reminder ${input.reminderId} not found`);

    // Done is retired (ADR-0001): a handler-level guard, not a caught domain
    // error — `fired → done` is itself a *valid* transition, so a still-fired
    // reminder would otherwise resolve successfully instead of being
    // rejected, which would violate AC-06. `resolveDone()`/`resolve_done` is
    // never invoked, regardless of the reminder's actual state.
    if (input.action === "done") {
      throw new InvalidStateTransitionError(reminder.state, "resolve_done");
    }

    reminder.resolveDelete();

    await this.repo.update(reminder);
    return reminder;
  }
}
