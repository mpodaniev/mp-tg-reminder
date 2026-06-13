import type { ReminderRepository } from "../ports/reminder-repository.js";
import { Reminder } from "../../domain/reminder.js";
import type { SourceSnapshot } from "../../domain/value-objects/source-snapshot.js";
import {
  UnauthorizedError,
  TimezoneNotConfiguredError,
} from "../../domain/errors.js";

export interface CaptureMessageInput {
  senderTelegramId: number;
  snapshot: Omit<SourceSnapshot, "id" | "createdAt">;
}

export class CaptureMessage {
  constructor(readonly repo: ReminderRepository) {}

  async execute(input: CaptureMessageInput): Promise<Reminder> {
    const settings = await this.repo.getOwnerSettings();

    if (!settings || input.senderTelegramId !== settings.ownerTelegramId) {
      throw new UnauthorizedError();
    }

    if (!settings.timezone) {
      throw new TimezoneNotConfiguredError();
    }

    const snapshotData: Omit<SourceSnapshot, "id"> = {
      ...input.snapshot,
      createdAt: Date.now(),
    };

    const reminder = Reminder.create({
      snapshot: { ...snapshotData, id: 0 },
    });

    return this.repo.saveWithSnapshot(snapshotData, reminder);
  }
}
