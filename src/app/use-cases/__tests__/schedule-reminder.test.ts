import { describe, it, expect, beforeEach } from "vitest";
import { ScheduleReminder } from "../schedule-reminder.js";
import { InMemoryReminderRepository } from "./helpers/in-memory-repo.js";
import { PastScheduledTimeError } from "../../../domain/errors.js";
import { Reminder } from "../../../domain/reminder.js";
import type { SourceSnapshot } from "../../../domain/value-objects/source-snapshot.js";

const OWNER_ID = 123456789;

describe("ScheduleReminder use case", () => {
  let repo: InMemoryReminderRepository;
  let useCase: ScheduleReminder;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
    useCase = new ScheduleReminder(repo);
  });

  it("schedules a reminder and transitions to pending (AC-02, AC-03)", async () => {
    const snapshot: SourceSnapshot = {
      id: 1,
      chatId: 100,
      messageId: 200,
      chatUsername: null,
      senderName: null,
      senderUsername: null,
      messageText: "test",
      mediaFileId: null,
      mediaType: null,
      isMediaProtected: false,
      createdAt: Date.now(),
    };
    const reminder = Reminder.reconstitute({ id: 1, snapshot, state: "awaiting_time" });
    repo.reminders.set(1, reminder);

    const future = Date.now() + 60_000;
    const updated = await useCase.execute({ reminderId: 1, scheduledAtMs: future });

    expect(updated.state).toBe("pending");
    expect(updated.scheduledAt).toBe(future);
  });

  it("throws PastScheduledTimeError for past time (AC-08)", async () => {
    const snapshot: SourceSnapshot = {
      id: 1,
      chatId: 100,
      messageId: 200,
      chatUsername: null,
      senderName: null,
      senderUsername: null,
      messageText: "test",
      mediaFileId: null,
      mediaType: null,
      isMediaProtected: false,
      createdAt: Date.now(),
    };
    const r = Reminder.reconstitute({ id: 2, snapshot, state: "awaiting_time" });
    repo.reminders.set(2, r);

    await expect(
      useCase.execute({ reminderId: 2, scheduledAtMs: Date.now() - 1000 })
    ).rejects.toThrow(PastScheduledTimeError);
  });
});
