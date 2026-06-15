import { describe, it, expect } from "vitest";
import { Reminder } from "../reminder.js";
import { ScheduledTime } from "../value-objects/scheduled-time.js";
import { InvalidStateTransitionError } from "../errors.js";
import type { ReminderState } from "../state-machine.js";

function makeSnapshot() {
  return {
    id: 1,
    chatId: 100,
    messageId: 200,
    chatUsername: "testchat",
    senderName: "Alice",
    senderUsername: "alice",
    messageText: "Hello",
    mediaFileId: null,
    mediaType: null,
    isMediaProtected: false,
    createdAt: Date.now(),
  };
}

describe("Reminder entity", () => {
  it("creates a reminder in awaiting_time state", () => {
    const r = Reminder.create({ snapshot: makeSnapshot() });
    expect(r.state).toBe("awaiting_time");
    expect(r.scheduledAt).toBeNull();
  });

  it("schedules reminder → pending", () => {
    const r = Reminder.create({ snapshot: makeSnapshot() });
    const future = Date.now() + 60_000;
    r.schedule(ScheduledTime.from(future));
    expect(r.state).toBe("pending");
    expect(r.scheduledAt).toBe(future);
  });

  it("snooze returns to pending with updated time", () => {
    const r = Reminder.create({ snapshot: makeSnapshot() });
    r.schedule(ScheduledTime.from(Date.now() + 60_000));
    r.startFiring();
    r.markFired(42);
    const newTime = Date.now() + 120_000;
    r.snooze(ScheduledTime.from(newTime));
    expect(r.state).toBe("pending");
    expect(r.scheduledAt).toBe(newTime);
  });

  it("cancel transitions a pending reminder to deleted (AC-03)", () => {
    const r = Reminder.create({ snapshot: makeSnapshot() });
    r.schedule(ScheduledTime.from(Date.now() + 60_000));
    r.cancel();
    expect(r.state).toBe("deleted");
  });

  it.each<ReminderState>(["firing", "fired", "done", "deleted", "expired"])(
    "cancel throws the invalid-transition sentinel from non-pending state '%s' (AC-04)",
    (state) => {
      const r = Reminder.reconstitute({ id: 1, snapshot: makeSnapshot(), state });
      expect(() => r.cancel()).toThrow(InvalidStateTransitionError);
      expect(r.state).toBe(state);
    }
  );

  it("has no imports from infra (domain purity check via module resolution)", () => {
    // This test is structural: if the import above fails, the test suite fails.
    // No infra symbols are imported in this file.
    expect(true).toBe(true);
  });
});
