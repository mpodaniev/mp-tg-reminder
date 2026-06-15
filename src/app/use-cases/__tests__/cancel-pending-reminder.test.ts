import { describe, it, expect, beforeEach, vi } from "vitest";
import { CancelPendingReminder } from "../cancel-pending-reminder.js";
import { InMemoryReminderRepository } from "./helpers/in-memory-repo.js";
import { Reminder } from "../../../domain/reminder.js";
import { InvalidStateTransitionError } from "../../../domain/errors.js";
import type { ReminderState } from "../../../domain/state-machine.js";
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

describe("CancelPendingReminder use-case (T5)", () => {
  let repo: InMemoryReminderRepository;
  let useCase: CancelPendingReminder;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
    useCase = new CancelPendingReminder(repo);
  });

  it("cancels a pending reminder → deleted and persists (AC-03)", async () => {
    const r = Reminder.reconstitute({
      id: 1,
      snapshot: makeSnapshot(),
      state: "pending",
      scheduledAt: Date.now() + 60_000,
    });
    repo.reminders.set(1, r);
    const updateSpy = vi.spyOn(repo, "update");

    const result = await useCase.execute({ reminderId: 1 });

    expect(result.state).toBe("deleted");
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect((await repo.findById(1))!.state).toBe("deleted");
  });

  it.each<ReminderState>(["firing", "fired", "done", "deleted", "expired"])(
    "surfaces the sentinel unchanged and persists nothing from non-pending state '%s' (AC-04)",
    async (state) => {
      const r = Reminder.reconstitute({ id: 2, snapshot: makeSnapshot(2), state });
      repo.reminders.set(2, r);
      const updateSpy = vi.spyOn(repo, "update");

      await expect(useCase.execute({ reminderId: 2 })).rejects.toBeInstanceOf(
        InvalidStateTransitionError
      );

      expect(updateSpy).not.toHaveBeenCalled();
      expect((await repo.findById(2))!.state).toBe(state);
    }
  );
});
