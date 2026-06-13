import { describe, it, expect, beforeEach } from "vitest";
import { SnoozeReminder } from "../snooze-reminder.js";
import { InMemoryReminderRepository } from "./helpers/in-memory-repo.js";
import { Reminder } from "../../../domain/reminder.js";
import { AlreadyResolvedError } from "../../../domain/errors.js";
import type { SourceSnapshot } from "../../../domain/value-objects/source-snapshot.js";

const OWNER_ID = 123456789;

function makeSnapshot(id = 1): SourceSnapshot {
  return {
    id,
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
}

function seedFiredReminder(repo: InMemoryReminderRepository, id = 1): Reminder {
  const r = Reminder.reconstitute({
    id,
    snapshot: makeSnapshot(id),
    state: "fired",
    scheduledAt: Date.now() - 1000,
    firedAt: Date.now() - 500,
    deliveredAt: Date.now() - 400,
    firedMessageId: 42,
  });
  repo.reminders.set(id, r);
  return r;
}

describe("SnoozeReminder use case", () => {
  let repo: InMemoryReminderRepository;
  let useCase: SnoozeReminder;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
    useCase = new SnoozeReminder(repo);
  });

  it("snooze returns reminder to pending with updated scheduledAt (AC-05)", async () => {
    seedFiredReminder(repo);
    const newTime = Date.now() + 60_000;
    const r = await useCase.execute({ reminderId: 1, newScheduledAtMs: newTime });
    expect(r.state).toBe("pending");
    expect(r.scheduledAt).toBe(newTime);
  });

  it("throws AlreadyResolvedError when snoozing a done reminder (AC-10)", async () => {
    const r = Reminder.reconstitute({ id: 2, snapshot: makeSnapshot(2), state: "done" });
    repo.reminders.set(2, r);
    await expect(useCase.execute({ reminderId: 2, newScheduledAtMs: Date.now() + 60_000 }))
      .rejects.toThrow(AlreadyResolvedError);
  });

  it("throws AlreadyResolvedError when snoozing a deleted reminder (AC-10)", async () => {
    const r = Reminder.reconstitute({ id: 3, snapshot: makeSnapshot(3), state: "deleted" });
    repo.reminders.set(3, r);
    await expect(useCase.execute({ reminderId: 3, newScheduledAtMs: Date.now() + 60_000 }))
      .rejects.toThrow(AlreadyResolvedError);
  });
});
