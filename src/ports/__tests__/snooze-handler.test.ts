import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSnooze, handleSnoozePick } from "../handlers/snooze-handler.js";
import { SnoozeReminder } from "../../app/use-cases/snooze-reminder.js";
import { InMemoryReminderRepository } from "../../app/use-cases/__tests__/helpers/in-memory-repo.js";
import { Reminder } from "../../domain/reminder.js";
import type { SourceSnapshot } from "../../domain/value-objects/source-snapshot.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";

const OWNER_ID = 123456789;
const OWNER_CHAT_ID = 777;
const TZ = "Europe/Kyiv";

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

function makeGateway(): TelegramGateway {
  return {
    sendReminder: vi.fn().mockResolvedValue({ messageId: 99 }),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editMessageToPlaceholder: vi.fn().mockResolvedValue(undefined),
    editListMessage: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

function makeCtx() {
  const answers: string[] = [];
  return {
    from: { id: OWNER_ID },
    callbackQuery: { id: "cq1", data: "snooze:1" },
    answerCallbackQuery: vi.fn().mockImplementation((text: string) => {
      answers.push(text ?? "");
      return Promise.resolve();
    }),
    reply: vi.fn().mockResolvedValue(undefined),
    editMessageReplyMarkup: vi.fn().mockResolvedValue(undefined),
    _answers: answers,
  };
}

describe("handleSnooze callback handler", () => {
  let repo: InMemoryReminderRepository;
  let snoozeUC: SnoozeReminder;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, TZ);
    snoozeUC = new SnoozeReminder(repo);
  });

  it("shows snooze quick-picks using Owner timezone for wall-clock visibility (AC-05)", async () => {
    const r = Reminder.reconstitute({
      id: 1,
      snapshot: makeSnapshot(),
      state: "fired",
      firedMessageId: 42,
    });
    repo.reminders.set(1, r);
    const ctx = makeCtx();

    await handleSnooze(ctx as any, snoozeUC, repo, 1);

    expect(ctx.reply).toHaveBeenCalled();
    const markup = (ctx.reply as any).mock.calls[0][1]?.reply_markup;
    expect(markup?.inline_keyboard).toBeDefined();
    const buttons = markup.inline_keyboard.flat();
    expect(buttons.some((b: any) => b.callback_data.includes("snooze_pick:"))).toBe(true);
  });

  it("hides 'evening' button when current hour in Owner timezone is >= 19 (AC-05)", async () => {
    const r = Reminder.reconstitute({ id: 1, snapshot: makeSnapshot(), state: "fired", firedMessageId: 42 });
    repo.reminders.set(1, r);
    const ctx = makeCtx();

    // Patch Date.now to a time that is >= 19:00 in Europe/Kyiv
    // Europe/Kyiv is UTC+3 (no DST in summer) — 16:01 UTC = 19:01 local
    const fakeNowMs = new Date("2026-06-13T16:01:00Z").getTime();
    vi.setSystemTime(fakeNowMs);

    await handleSnooze(ctx as any, snoozeUC, repo, 1);

    vi.useRealTimers();

    const markup = (ctx.reply as any).mock.calls[0][1]?.reply_markup;
    const buttons = markup.inline_keyboard.flat();
    const hasEvening = buttons.some((b: any) => b.callback_data.includes(":evening"));
    expect(hasEvening).toBe(false);
  });

  it("shows 'evening' button when current hour in Owner timezone is < 19 (AC-05)", async () => {
    const r = Reminder.reconstitute({ id: 1, snapshot: makeSnapshot(), state: "fired", firedMessageId: 42 });
    repo.reminders.set(1, r);
    const ctx = makeCtx();

    // 08:00 UTC = 11:00 Europe/Kyiv (< 19, show evening)
    const fakeNowMs = new Date("2026-06-13T08:00:00Z").getTime();
    vi.setSystemTime(fakeNowMs);

    await handleSnooze(ctx as any, snoozeUC, repo, 1);

    vi.useRealTimers();

    const markup = (ctx.reply as any).mock.calls[0][1]?.reply_markup;
    const buttons = markup.inline_keyboard.flat();
    const hasEvening = buttons.some((b: any) => b.callback_data.includes(":evening"));
    expect(hasEvening).toBe(true);
  });

  it("answers with 'already resolved' when snoozing a done reminder (AC-10)", async () => {
    const r = Reminder.reconstitute({ id: 2, snapshot: makeSnapshot(2), state: "done" });
    repo.reminders.set(2, r);
    const ctx = makeCtx();

    await handleSnooze(ctx as any, snoozeUC, repo, 2);

    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    const msg = (ctx.answerCallbackQuery as any).mock.calls[0][0];
    expect(typeof msg === "string" && msg.length > 0).toBe(true);
  });
});

describe("handleSnoozePick — schedules + edits fired message (AC-05)", () => {
  let repo: InMemoryReminderRepository;
  let snoozeUC: SnoozeReminder;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, TZ);
    snoozeUC = new SnoozeReminder(repo);
  });

  it("edits the original fired-reminder message after snoozing (AC-05)", async () => {
    const r = Reminder.reconstitute({
      id: 1,
      snapshot: makeSnapshot(),
      state: "fired",
      scheduledAt: Date.now() - 60000,
      firedMessageId: 42,
    });
    repo.reminders.set(1, r);

    const gateway = makeGateway();
    const ctx = makeCtx();

    await handleSnoozePick(ctx as any, snoozeUC, repo, 1, "1h", gateway, OWNER_CHAT_ID);

    expect(gateway.editMessageToPlaceholder).toHaveBeenCalledWith(
      OWNER_CHAT_ID,
      42,
      expect.stringContaining("Відкладено")
    );
  });

  it("schedules evening pick at 19:00 in Owner timezone (AC-02)", async () => {
    const r = Reminder.reconstitute({
      id: 2,
      snapshot: makeSnapshot(2),
      state: "fired",
      scheduledAt: Date.now() - 1000,
      firedMessageId: 55,
    });
    repo.reminders.set(2, r);

    // Fake now = 10:00 UTC = 13:00 Kyiv (before 19:00, evening pick valid)
    const fakeNow = new Date("2026-06-13T10:00:00Z").getTime();
    vi.setSystemTime(fakeNow);

    const gateway = makeGateway();
    const ctx = makeCtx();

    await handleSnoozePick(ctx as any, snoozeUC, repo, 2, "evening", gateway, OWNER_CHAT_ID);

    vi.useRealTimers();

    const updated = await repo.findById(2);
    expect(updated!.scheduledAt).not.toBeNull();

    // Verify scheduled time shows 19:00 in Kyiv tz
    const formatted = new Intl.DateTimeFormat("uk", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(updated!.scheduledAt!));
    expect(formatted).toBe("19:00");
  });

  it("schedules tomorrow pick at 07:00 next day in Owner timezone (AC-02)", async () => {
    const r = Reminder.reconstitute({
      id: 3,
      snapshot: makeSnapshot(3),
      state: "fired",
      scheduledAt: Date.now() - 1000,
      firedMessageId: 66,
    });
    repo.reminders.set(3, r);

    const fakeNow = new Date("2026-06-13T10:00:00Z").getTime();
    vi.setSystemTime(fakeNow);

    const gateway = makeGateway();
    const ctx = makeCtx();

    await handleSnoozePick(ctx as any, snoozeUC, repo, 3, "tomorrow", gateway, OWNER_CHAT_ID);

    vi.useRealTimers();

    const updated = await repo.findById(3);
    expect(updated!.scheduledAt).not.toBeNull();

    // Should be 07:00 on June 14 in Kyiv
    const formatted = new Intl.DateTimeFormat("uk", {
      timeZone: TZ,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(updated!.scheduledAt!));
    expect(formatted).toContain("14.06");
    expect(formatted).toContain("07:00");
  });
});
