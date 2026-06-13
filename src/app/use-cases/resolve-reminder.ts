import type { ReminderRepository } from "../ports/reminder-repository.js";

export interface ResolveReminderInput {
  reminderId: number;
  action: "done" | "delete";
}

export class ResolveReminder {
  constructor(private readonly repo: ReminderRepository) {}

  async execute(input: ResolveReminderInput) {
    const reminder = await this.repo.findById(input.reminderId);
    if (!reminder) throw new Error(`Reminder ${input.reminderId} not found`);

    if (input.action === "done") {
      reminder.resolveDone();
    } else {
      reminder.resolveDelete();
    }

    await this.repo.update(reminder);
    return reminder;
  }
}
