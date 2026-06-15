import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryReminderRepository } from "./helpers/in-memory-repo.js";
import { Reminder } from "../../../domain/reminder.js";
import type { SourceSnapshot } from "../../../domain/value-objects/source-snapshot.js";

const OWNER_ID = 123456789;

function makeSnapshot(id: number): SourceSnapshot {
  return {
    id,
    chatId: 100,
    messageId: 200 + id,
    chatUsername: null,
    senderName: null,
    senderUsername: null,
    messageText: `text ${id}`,
    mediaFileId: null,
    mediaType: null,
    isMediaProtected: false,
    createdAt: Date.now(),
  };
}

function pending(id: number, scheduledAt: number): Reminder {
  return Reminder.reconstitute({
    id,
    snapshot: makeSnapshot(id),
    state: "pending",
    scheduledAt,
  });
}

describe("ReminderRepository.findActivePendingOrdered (T2 port contract, AC-01)", () => {
  let repo: InMemoryReminderRepository;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
  });

  it("returns only pending reminders ordered by fire time ascending", async () => {
    repo.reminders.set(1, pending(1, 3000));
    repo.reminders.set(2, pending(2, 1000));
    repo.reminders.set(3, pending(3, 2000));
    repo.reminders.set(4, Reminder.reconstitute({ id: 4, snapshot: makeSnapshot(4), state: "fired" }));

    const result = await repo.findActivePendingOrdered();

    expect(result.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it("tie-breaks equal fire times by capture order (id ascending), earliest first", async () => {
    repo.reminders.set(10, pending(10, 5000));
    repo.reminders.set(7, pending(7, 5000));
    repo.reminders.set(9, pending(9, 5000));

    const result = await repo.findActivePendingOrdered();

    expect(result.map((r) => r.id)).toEqual([7, 9, 10]);
  });

  it("returns an empty array when no pending reminders exist", async () => {
    repo.reminders.set(1, Reminder.reconstitute({ id: 1, snapshot: makeSnapshot(1), state: "deleted" }));
    expect(await repo.findActivePendingOrdered()).toEqual([]);
  });
});
