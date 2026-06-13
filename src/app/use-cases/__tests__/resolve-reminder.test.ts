import { describe, it, expect, beforeEach } from "vitest";
import { ResolveReminder } from "../resolve-reminder.js";
import { InMemoryReminderRepository } from "./helpers/in-memory-repo.js";
import { Reminder } from "../../../domain/reminder.js";
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

describe("ResolveReminder use case", () => {
  let repo: InMemoryReminderRepository;
  let useCase: ResolveReminder;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
    useCase = new ResolveReminder(repo);
  });

  it("resolves fired reminder as done (AC-06)", async () => {
    const r = Reminder.reconstitute({
      id: 1,
      snapshot: makeSnapshot(),
      state: "fired",
      firedMessageId: 42,
    });
    repo.reminders.set(1, r);
    const updated = await useCase.execute({ reminderId: 1, action: "done" });
    expect(updated.state).toBe("done");
  });

  it("resolves fired reminder as deleted (AC-07)", async () => {
    const r = Reminder.reconstitute({
      id: 2,
      snapshot: makeSnapshot(2),
      state: "fired",
      firedMessageId: 43,
    });
    repo.reminders.set(2, r);
    const updated = await useCase.execute({ reminderId: 2, action: "delete" });
    expect(updated.state).toBe("deleted");
  });
});
