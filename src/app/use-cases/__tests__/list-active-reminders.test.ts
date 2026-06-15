import { describe, it, expect, beforeEach } from "vitest";
import {
  ListActiveReminders,
  MAX_ACTIVE_LIST_ROWS,
} from "../list-active-reminders.js";
import { InMemoryReminderRepository } from "./helpers/in-memory-repo.js";
import { Reminder } from "../../../domain/reminder.js";
import type { SourceSnapshot } from "../../../domain/value-objects/source-snapshot.js";

const OWNER_ID = 123456789;

function snapshot(id: number, text: string | null): SourceSnapshot {
  return {
    id,
    chatId: 100,
    messageId: 200 + id,
    chatUsername: null,
    senderName: null,
    senderUsername: null,
    messageText: text,
    mediaFileId: null,
    mediaType: null,
    isMediaProtected: false,
    createdAt: id,
  };
}

function pending(id: number, scheduledAt: number, text: string | null): Reminder {
  return Reminder.reconstitute({
    id,
    snapshot: snapshot(id, text),
    state: "pending",
    scheduledAt,
  });
}

describe("ListActiveReminders use-case (T4)", () => {
  let repo: InMemoryReminderRepository;
  let useCase: ListActiveReminders;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
    useCase = new ListActiveReminders(repo);
  });

  it("empty pending set yields an empty view model (AC-02)", async () => {
    const vm = await useCase.execute();
    expect(vm.isEmpty).toBe(true);
    expect(vm.rows).toEqual([]);
    expect(vm.overflowCount).toBe(0);
  });

  it("returns rows in repo order with fire time and a bounded first-line preview (AC-01)", async () => {
    repo.reminders.set(1, pending(1, 1000, "first reminder"));
    repo.reminders.set(2, pending(2, 2000, "second\nignored second line"));

    const vm = await useCase.execute();

    expect(vm.isEmpty).toBe(false);
    expect(vm.overflowCount).toBe(0);
    expect(vm.rows.map((r) => r.reminderId)).toEqual([1, 2]);
    expect(vm.rows[0]!.fireTimeMs).toBe(1000);
    expect(vm.rows[0]!.preview).toBe("first reminder");
    // first line only
    expect(vm.rows[1]!.preview).toBe("second");
  });

  it("truncates the source preview to the first line, capped at ~100 chars (AC-01)", async () => {
    const long = "x".repeat(250);
    repo.reminders.set(1, pending(1, 1000, long));

    const vm = await useCase.execute();

    expect(vm.rows[0]!.preview.length).toBeLessThanOrEqual(100);
    expect(vm.rows[0]!.preview.endsWith("…")).toBe(true);
  });

  it("caps the row count at MAX_ACTIVE_LIST_ROWS and counts the overflow (AC-08)", async () => {
    const total = MAX_ACTIVE_LIST_ROWS + 7;
    for (let i = 1; i <= total; i++) {
      repo.reminders.set(i, pending(i, i, "r")); // short preview → count cap hits first
    }

    const vm = await useCase.execute();

    expect(vm.rows.length).toBe(MAX_ACTIVE_LIST_ROWS);
    expect(vm.overflowCount).toBe(7);
    // soonest-firing kept
    expect(vm.rows[0]!.fireTimeMs).toBe(1);
  });

  it("truncates on the 4096-char budget before the row cap when previews are long (AC-08)", async () => {
    // 100-char previews → char budget bites well before MAX_ACTIVE_LIST_ROWS
    for (let i = 1; i <= MAX_ACTIVE_LIST_ROWS; i++) {
      repo.reminders.set(i, pending(i, i, "y".repeat(100)));
    }

    const vm = await useCase.execute();

    expect(vm.rows.length).toBeLessThan(MAX_ACTIVE_LIST_ROWS);
    expect(vm.overflowCount).toBe(MAX_ACTIVE_LIST_ROWS - vm.rows.length);
    expect(vm.overflowCount).toBeGreaterThan(0);
  });
});
