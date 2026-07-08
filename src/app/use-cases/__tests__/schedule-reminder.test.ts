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
    const result = await useCase.execute({ reminderId: 1, scheduledAtMs: future });

    expect(result.reminder.state).toBe("pending");
    expect(result.reminder.scheduledAt).toBe(future);
  });

  it("flags deliveryMayBeLate when the chosen time is sooner than the wake interval (AC-03)", async () => {
    const snapshot: SourceSnapshot = {
      id: 10, chatId: 100, messageId: 200, chatUsername: null,
      senderName: null, senderUsername: null, messageText: "test",
      mediaFileId: null, mediaType: null, isMediaProtected: false, createdAt: Date.now(),
    };
    repo.reminders.set(10, Reminder.reconstitute({ id: 10, snapshot, state: "awaiting_time" }));

    const wakeIntervalUseCase = new ScheduleReminder(repo, 3 * 60 * 1000);
    const soon = Date.now() + 60_000; // 1 min — sooner than the 3-min wake interval
    const result = await wakeIntervalUseCase.execute({ reminderId: 10, scheduledAtMs: soon });

    expect(result.deliveryMayBeLate).toBe(true);
  });

  it("does not flag deliveryMayBeLate when the chosen time has headroom over the wake interval (AC-03)", async () => {
    const snapshot: SourceSnapshot = {
      id: 11, chatId: 100, messageId: 200, chatUsername: null,
      senderName: null, senderUsername: null, messageText: "test",
      mediaFileId: null, mediaType: null, isMediaProtected: false, createdAt: Date.now(),
    };
    repo.reminders.set(11, Reminder.reconstitute({ id: 11, snapshot, state: "awaiting_time" }));

    const wakeIntervalUseCase = new ScheduleReminder(repo, 3 * 60 * 1000);
    const later = Date.now() + 10 * 60_000; // 10 min — headroom over the 3-min wake interval
    const result = await wakeIntervalUseCase.execute({ reminderId: 11, scheduledAtMs: later });

    expect(result.deliveryMayBeLate).toBe(false);
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
