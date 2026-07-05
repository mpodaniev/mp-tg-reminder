import { describe, it, expect, vi } from "vitest";
import { Scheduler } from "../scheduler.js";
import { FireDueReminders } from "../../app/use-cases/fire-due-reminders.js";
import { ExpireStalePrompts } from "../../app/use-cases/expire-stale-prompts.js";
import { InMemoryReminderRepository } from "../../app/use-cases/__tests__/helpers/in-memory-repo.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";

const OWNER_ID = 123456789;
const CHAT_ID = 777;
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

  function setup() {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
    gateway = makeFakeGateway();
    fireUC = new FireDueReminders(repo, gateway, CHAT_ID);
    expireUC = new ExpireStalePrompts(repo);
    scheduler = new Scheduler(fireUC, expireUC, EXPIRE_CUTOFF_MS);
  }

  it("tick() is a public method that resolves after fire+expire complete", async () => {
    setup();
    const fireSpy = vi.spyOn(fireUC, "execute").mockResolvedValue(undefined);
    const expireSpy = vi.spyOn(expireUC, "execute").mockResolvedValue(undefined);

    await scheduler.tick();

    expect(fireSpy).toHaveBeenCalledTimes(1);
    expect(expireSpy).toHaveBeenCalledWith(EXPIRE_CUTOFF_MS);
  });

  it("coalesces overlapping tick() calls into a single run (AC-06: a wake retry never double-fires)", async () => {
    setup();
    let releaseFire: () => void = () => {};
    const fireGate = new Promise<void>((resolve) => {
      releaseFire = resolve;
    });
    const fireSpy = vi.spyOn(fireUC, "execute").mockImplementation(() => fireGate);
    const expireSpy = vi.spyOn(expireUC, "execute").mockResolvedValue(undefined);

    // Two overlapping wake calls while the first tick is still in flight.
    const first = scheduler.tick();
    const second = scheduler.tick();

    releaseFire();
    await Promise.all([first, second]);

    // Only one fire/expire pass ran, even though tick() was called twice.
    expect(fireSpy).toHaveBeenCalledTimes(1);
    expect(expireSpy).toHaveBeenCalledTimes(1);
  });

  it("stop() called mid-tick resolves only after the in-flight tick finishes", async () => {
    setup();
    let releaseFire: () => void = () => {};
    const fireGate = new Promise<void>((resolve) => {
      releaseFire = resolve;
    });
    vi.spyOn(fireUC, "execute").mockImplementation(() => fireGate);
    vi.spyOn(expireUC, "execute").mockResolvedValue(undefined);

    const tickPromise = scheduler.tick();
    let stopResolved = false;
    const stopPromise = scheduler.stop().then(() => {
      stopResolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(stopResolved).toBe(false);

    releaseFire();
    await tickPromise;
    await stopPromise;
    expect(stopResolved).toBe(true);
  });

  it("has no setInterval-based start() method (ADR-0001: wake call is the sole trigger)", () => {
    setup();
    expect((scheduler as unknown as { start?: unknown }).start).toBeUndefined();
  });
});
