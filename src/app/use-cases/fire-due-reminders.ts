import type { ReminderRepository } from "../ports/reminder-repository.js";
import type { TelegramGateway } from "../ports/telegram-gateway.js";

export class FireDueReminders {
  constructor(
    private readonly repo: ReminderRepository,
    private readonly gateway: TelegramGateway,
    private readonly ownerChatId: number
  ) {}

  async execute(): Promise<void> {
    const now = Date.now();
    const due = await this.repo.findDuePending(now);
    const stuck = await this.repo.findFiring();

    const toFire = [...due, ...stuck];

    for (const reminder of toFire) {
      if (reminder.state === "pending") {
        reminder.startFiring();
        await this.repo.update(reminder);
      }

      try {
        const result = await this.gateway.sendReminder(this.ownerChatId, reminder);
        reminder.markFired(result.messageId);
        await this.repo.update(reminder);
      } catch {
        // leave in firing state for re-fire on next tick (ADR-0005)
      }
    }
  }
}
