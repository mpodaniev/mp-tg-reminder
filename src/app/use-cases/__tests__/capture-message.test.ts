import { describe, it, expect, beforeEach } from "vitest";
import { CaptureMessage } from "../capture-message.js";
import { InMemoryReminderRepository } from "./helpers/in-memory-repo.js";
import { TimezoneNotConfiguredError, UnauthorizedError } from "../../../domain/errors.js";

const OWNER_ID = 123456789;
const OTHER_ID = 999999999;

function makeSnapshotInput() {
  return {
    chatId: 100,
    messageId: 200,
    chatUsername: "testchat" as string | null,
    senderName: "Alice" as string | null,
    senderUsername: "alice" as string | null,
    messageText: "Hello" as string | null,
    mediaFileId: null as string | null,
    mediaType: null as string | null,
    isMediaProtected: false,
  };
}

describe("CaptureMessage use case", () => {
  let repo: InMemoryReminderRepository;
  let useCase: CaptureMessage;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
    useCase = new CaptureMessage(repo);
  });

  it("creates a reminder in awaiting_time state for the Owner", async () => {
    const reminder = await useCase.execute({
      senderTelegramId: OWNER_ID,
      snapshot: makeSnapshotInput(),
    });
    expect(reminder.state).toBe("awaiting_time");
    expect(reminder.id).toBeDefined();
  });

  it("throws UnauthorizedError for non-Owner (AC-09)", async () => {
    await expect(
      useCase.execute({
        senderTelegramId: OTHER_ID,
        snapshot: makeSnapshotInput(),
      })
    ).rejects.toThrow(UnauthorizedError);
  });

  it("throws TimezoneNotConfiguredError when timezone is null (AC-13)", async () => {
    const repoNoTz = new InMemoryReminderRepository(OWNER_ID, null);
    const uc = new CaptureMessage(repoNoTz);
    await expect(
      uc.execute({
        senderTelegramId: OWNER_ID,
        snapshot: makeSnapshotInput(),
      })
    ).rejects.toThrow(TimezoneNotConfiguredError);
  });

  it("does not store anything if unauthorized (AC-09)", async () => {
    try {
      await useCase.execute({
        senderTelegramId: OTHER_ID,
        snapshot: makeSnapshotInput(),
      });
    } catch {}
    expect(repo.reminders.size).toBe(0);
  });
});
