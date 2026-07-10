import { describe, it, expect, beforeEach } from "vitest";
import { GetStats } from "../get-stats.js";
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

describe("GetStats use-case", () => {
  let repo: InMemoryReminderRepository;
  let useCase: GetStats;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
    useCase = new GetStats(repo);
  });

  it("delegates status counts and average reaction time from the repository", async () => {
    repo.reminders.set(
      1,
      Reminder.reconstitute({
        id: 1,
        snapshot: snapshot(1, "a"),
        state: "pending",
        createdAt: 1000,
      })
    );

    const result = await useCase.execute();

    expect(result.statusCounts.pending).toBe(1);
    expect(result.avgReactionTimeMs).toBeNull();
  });

  it("converts each longest-active entry's raw message text into a bounded preview", async () => {
    const long = "x".repeat(250);
    repo.reminders.set(
      1,
      Reminder.reconstitute({
        id: 1,
        snapshot: snapshot(1, long),
        state: "pending",
        createdAt: 1000,
      })
    );

    const result = await useCase.execute();

    expect(result.longestActive[0]!.preview.length).toBeLessThanOrEqual(100);
    expect(result.longestActive[0]!.preview.endsWith("…")).toBe(true);
    expect(result.longestActive[0]!.reminderId).toBe(1);
  });
});
