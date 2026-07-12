import { describe, it, expect, beforeEach, vi } from "vitest";
import { FireDueReminders } from "../fire-due-reminders.js";
import { InMemoryReminderRepository } from "./helpers/in-memory-repo.js";
import { Reminder } from "../../../domain/reminder.js";
import type { SourceSnapshot } from "../../../domain/value-objects/source-snapshot.js";
import type { TelegramGateway } from "../../ports/telegram-gateway.js";

const OWNER_ID = 123456789;
const OWNER_CHAT_ID = 777;

function makeSnapshot(id = 1): SourceSnapshot {
  return {
    id,
    chatId: 100,
    messageId: 200,
    chatUsername: "chat",
    senderName: null,
    senderUsername: null,
    messageText: "Fire me",
    mediaFileId: null,
    mediaType: null,
    isMediaProtected: false,
    createdAt: Date.now() - 10_000,
  };
}

function makeFakeGateway(): TelegramGateway {
  return {
    sendReminder: vi.fn().mockResolvedValue({ messageId: 42 }),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editMessageToPlaceholder: vi.fn().mockResolvedValue(undefined),
    editListMessage: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

function seedDueReminder(repo: InMemoryReminderRepository, id = 1): Reminder {
  const r = Reminder.reconstitute({
    id,
    snapshot: makeSnapshot(id),
    state: "pending",
    scheduledAt: Date.now() - 1000,
  });
  repo.reminders.set(id, r);
  return r;
}

describe("FireDueReminders use case", () => {
  let repo: InMemoryReminderRepository;
  let gateway: TelegramGateway;
  let useCase: FireDueReminders;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
    gateway = makeFakeGateway();
    useCase = new FireDueReminders(repo, gateway, OWNER_CHAT_ID);
  });

  it("marks reminder as firing before sending (AC-04)", async () => {
    seedDueReminder(repo);
    let stateAtSend = "";
    (gateway.sendReminder as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      stateAtSend = repo.reminders.get(1)!.state;
      return { messageId: 42 };
    });

    await useCase.execute();
    expect(stateAtSend).toBe("firing");
  });

  it("marks reminder as fired and sets delivered_at after gateway ack (AC-04)", async () => {
    seedDueReminder(repo);
    await useCase.execute();

    const r = repo.reminders.get(1)!;
    expect(r.state).toBe("fired");
    expect(r.deliveredAt).not.toBeNull();
    expect(r.firedMessageId).toBe(42);
  });

  it("re-fires a reminder stuck in firing state (crash simulation, ADR-0005)", async () => {
    const r = Reminder.reconstitute({
      id: 1,
      snapshot: makeSnapshot(),
      state: "firing",
      scheduledAt: Date.now() - 1000,
    });
    repo.reminders.set(1, r);

    await useCase.execute();

    const updated = repo.reminders.get(1)!;
    expect(updated.state).toBe("fired");
  });

  it("does not re-fire already-delivered reminders (delivered_at guard)", async () => {
    const r = Reminder.reconstitute({
      id: 1,
      snapshot: makeSnapshot(),
      state: "fired",
      scheduledAt: Date.now() - 1000,
      deliveredAt: Date.now() - 500,
      firedMessageId: 99,
    });
    repo.reminders.set(1, r);

    await useCase.execute();

    expect(gateway.sendReminder).not.toHaveBeenCalled();
  });

  it("calling execute() twice for the same due reminder (retried wake call) sends exactly once (AC-06)", async () => {
    seedDueReminder(repo);

    await useCase.execute();
    await useCase.execute();

    expect(gateway.sendReminder).toHaveBeenCalledTimes(1);
    expect(repo.reminders.get(1)!.state).toBe("fired");
  });

  it("a reminder left in firing after a failed send is retried but never sent successfully twice (AC-06)", async () => {
    seedDueReminder(repo);
    (gateway.sendReminder as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValue({ messageId: 42 });

    await useCase.execute(); // fails, left in "firing"
    expect(repo.reminders.get(1)!.state).toBe("firing");

    await useCase.execute(); // retries, succeeds
    expect(repo.reminders.get(1)!.state).toBe("fired");

    await useCase.execute(); // a later tick must not re-send the already-fired reminder

    expect(gateway.sendReminder).toHaveBeenCalledTimes(2);
  });
});
