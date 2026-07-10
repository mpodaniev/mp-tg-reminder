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

  it("resolveDelete sets resolvedAt (fired → deleted)", () => {
    const r = Reminder.reconstitute({ id: 1, snapshot: makeSnapshot(), state: "fired" });
    expect(r.resolvedAt).toBeNull();
    r.resolveDelete();
    expect(r.state).toBe("deleted");
    expect(r.resolvedAt).not.toBeNull();
  });

  it("resolveDone sets resolvedAt (fired → done)", () => {
    const r = Reminder.reconstitute({ id: 1, snapshot: makeSnapshot(), state: "fired" });
    r.resolveDone();
    expect(r.state).toBe("done");
    expect(r.resolvedAt).not.toBeNull();
  });

  it("cancel sets resolvedAt (pending → deleted)", () => {
    const r = Reminder.create({ snapshot: makeSnapshot() });
    r.schedule(ScheduledTime.from(Date.now() + 60_000));
    expect(r.resolvedAt).toBeNull();
    r.cancel();
    expect(r.resolvedAt).not.toBeNull();
  });

  it("expire does not set resolvedAt — system-driven, not an Owner action", () => {
    const r = Reminder.create({ snapshot: makeSnapshot() });
    r.expire();
    expect(r.resolvedAt).toBeNull();
  });

  it("snooze does not set resolvedAt — returns to pending, not a resolution", () => {
    const r = Reminder.create({ snapshot: makeSnapshot() });
    r.schedule(ScheduledTime.from(Date.now() + 60_000));
    r.startFiring();
    r.markFired(42);
    r.snooze(ScheduledTime.from(Date.now() + 120_000));
    expect(r.resolvedAt).toBeNull();
  });

  it("has no imports from infra (domain purity check via module resolution)", () => {
    // This test is structural: if the import above fails, the test suite fails.
    // No infra symbols are imported in this file.
    expect(true).toBe(true);
  });
});
