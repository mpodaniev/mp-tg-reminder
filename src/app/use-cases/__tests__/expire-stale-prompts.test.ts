import { describe, it, expect, beforeEach } from "vitest";
import { ExpireStalePrompts } from "../expire-stale-prompts.js";
import { InMemoryReminderRepository } from "./helpers/in-memory-repo.js";
import { Reminder } from "../../../domain/reminder.js";
import type { SourceSnapshot } from "../../../domain/value-objects/source-snapshot.js";

const OWNER_ID = 123456789;

function makeSnapshot(id = 1): SourceSnapshot {
  return {
    id,
    chatId: 100,
    messageId: 200 + id,
    chatUsername: null,
    senderName: null,
    senderUsername: null,
    messageText: null,
    mediaFileId: null,
    mediaType: null,
    isMediaProtected: false,
    createdAt: Date.now() - 30 * 60 * 60 * 1000,
  };
}

describe("ExpireStalePrompts use case", () => {
  let repo: InMemoryReminderRepository;
  let useCase: ExpireStalePrompts;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
    useCase = new ExpireStalePrompts(repo);
  });

  it("expires awaiting_time reminders older than cutoff (AC-12 / spec §8 OQ-3)", async () => {
    const cutoffMs = 24 * 60 * 60 * 1000;
    const oldSnapshot = { ...makeSnapshot(1), createdAt: Date.now() - cutoffMs - 1000 };
    const r = Reminder.reconstitute({
      id: 1,
      snapshot: oldSnapshot,
      state: "awaiting_time",
      createdAt: Date.now() - cutoffMs - 1000,
    });
    repo.reminders.set(1, r);

    await useCase.execute(cutoffMs);

    expect(repo.reminders.get(1)!.state).toBe("expired");
  });

  it("does not expire awaiting_time reminders within the cutoff", async () => {
    const cutoffMs = 24 * 60 * 60 * 1000;
    const freshSnapshot = { ...makeSnapshot(2), createdAt: Date.now() - 1000 };
    const r = Reminder.reconstitute({
      id: 2,
      snapshot: freshSnapshot,
      state: "awaiting_time",
      createdAt: Date.now() - 1000,
    });
    repo.reminders.set(2, r);

    await useCase.execute(cutoffMs);

    expect(repo.reminders.get(2)!.state).toBe("awaiting_time");
  });
});
