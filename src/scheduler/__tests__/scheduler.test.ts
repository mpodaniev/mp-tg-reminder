import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Scheduler } from "../scheduler.js";
import { FireDueReminders } from "../../app/use-cases/fire-due-reminders.js";
import { ExpireStalePrompts } from "../../app/use-cases/expire-stale-prompts.js";
import { InMemoryReminderRepository } from "../../app/use-cases/__tests__/helpers/in-memory-repo.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";

const OWNER_ID = 123456789;
const CHAT_ID = 777;
const TICK_MS = 50;
const EXPIRE_CUTOFF_MS = 24 * 60 * 60 * 1000;

function makeFakeGateway(): TelegramGateway {
  return {
    sendReminder: vi.fn().mockResolvedValue({ messageId: 1 }),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editMessageToPlaceholder: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Scheduler", () => {
  let repo: InMemoryReminderRepository;
  let gateway: TelegramGateway;
  let fireUC: FireDueReminders;
  let expireUC: ExpireStalePrompts;
  let scheduler: Scheduler;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
    gateway = makeFakeGateway();
    fireUC = new FireDueReminders(repo, gateway, CHAT_ID);
    expireUC = new ExpireStalePrompts(repo);
    scheduler = new Scheduler(fireUC, expireUC, TICK_MS, EXPIRE_CUTOFF_MS);
  });

  afterEach(() => {
    scheduler.stop();
  });

  it("start() triggers FireDueReminders each tick", async () => {
    const fireSpy = vi.spyOn(fireUC, "execute").mockResolvedValue(undefined);
    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, TICK_MS * 2 + 20));
    expect(fireSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("ExpireStalePrompts is called each tick", async () => {
    const expireSpy = vi.spyOn(expireUC, "execute").mockResolvedValue(undefined);
    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, TICK_MS * 2 + 20));
    expect(expireSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("stop() halts ticks cleanly", async () => {
    const fireSpy = vi.spyOn(fireUC, "execute").mockResolvedValue(undefined);
    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, TICK_MS + 10));
    scheduler.stop();
    const callsAfterStop = fireSpy.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, TICK_MS * 3));
    expect(fireSpy.mock.calls.length).toBe(callsAfterStop);
  });
});
