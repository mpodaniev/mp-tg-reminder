import { describe, it, expect, beforeEach } from "vitest";
import {
  ListActiveReminders,
  MAX_ACTIVE_LIST_ROWS,
} from "../list-active-reminders.js";
import { InMemoryReminderRepository } from "./helpers/in-memory-repo.js";
import { Reminder } from "../../../domain/reminder.js";
import { ScheduledTime } from "../../../domain/value-objects/scheduled-time.js";
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

function fired(id: number, text: string | null): Reminder {
  return Reminder.reconstitute({
    id,
    snapshot: snapshot(id, text),
    state: "fired",
    scheduledAt: id,
    firedAt: id,
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

  it("includes fired-but-undeleted reminders alongside pending ones (AC-01)", async () => {
    repo.reminders.set(1, pending(1, 1000, "scheduled"));
    repo.reminders.set(2, fired(2, "already fired"));

    const vm = await useCase.execute();

    expect(vm.rows.map((r) => r.reminderId)).toEqual([1, 2]);
  });

  it("marks each row as scheduled or fired (AC-02)", async () => {
    repo.reminders.set(1, pending(1, 1000, "scheduled"));
    repo.reminders.set(2, fired(2, "already fired"));

    const vm = await useCase.execute();

    expect(vm.rows.find((r) => r.reminderId === 1)!.status).toBe("scheduled");
    expect(vm.rows.find((r) => r.reminderId === 2)!.status).toBe("fired");
  });

  it("orders and truncates by capture order (id ascending), earliest-added kept (AC-03/AC-08)", async () => {
    const total = MAX_ACTIVE_LIST_ROWS + 5;
    for (let i = 1; i <= total; i++) {
      // fire time descending so a fire-time sort would disagree with id order
      repo.reminders.set(i, i % 2 === 0 ? fired(i, "r") : pending(i, total - i, "r"));
    }

    const vm = await useCase.execute();

    expect(vm.rows.length).toBe(MAX_ACTIVE_LIST_ROWS);
    expect(vm.overflowCount).toBe(5);
    expect(vm.rows.map((r) => r.reminderId)).toEqual(
      Array.from({ length: MAX_ACTIVE_LIST_ROWS }, (_, i) => i + 1)
    );
  });

  it("keeps list position stable across fire, deliver, and snooze; only delete removes it (AC-03/AC-04)", async () => {
    repo.reminders.set(1, pending(1, 5000, "other"));
    const target = pending(2, 1000, "target");
    repo.reminders.set(2, target);
    const positionOf = (vm: Awaited<ReturnType<typeof useCase.execute>>) =>
      vm.rows.findIndex((r) => r.reminderId === 2);

    let vm = await useCase.execute();
    expect(vm.rows.map((r) => r.reminderId)).toEqual([1, 2]);
    expect(positionOf(vm)).toBe(1);

    target.startFiring();
    await repo.update(target);

    target.markFired(555);
    await repo.update(target);
    vm = await useCase.execute();
    expect(positionOf(vm)).toBe(1);
    expect(vm.rows[1]!.status).toBe("fired");

    target.snooze(ScheduledTime.from(Date.now() + 100_000));
    await repo.update(target);
    vm = await useCase.execute();
    expect(positionOf(vm)).toBe(1);
    expect(vm.rows[1]!.status).toBe("scheduled");

    target.cancel();
    await repo.update(target);
    vm = await useCase.execute();
    expect(vm.rows.map((r) => r.reminderId)).toEqual([1]);
  });
});
