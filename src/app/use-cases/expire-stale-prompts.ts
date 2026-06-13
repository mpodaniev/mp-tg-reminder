import type { ReminderRepository } from "../ports/reminder-repository.js";

export class ExpireStalePrompts {
  constructor(private readonly repo: ReminderRepository) {}

  async execute(cutoffMs: number): Promise<void> {
    const cutoffTime = Date.now() - cutoffMs;
    const stale = await this.repo.findAwaitingOlderThan(cutoffTime);

    for (const reminder of stale) {
      reminder.expire();
      await this.repo.update(reminder);
    }
  }
}
