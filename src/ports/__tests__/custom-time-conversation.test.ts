import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseCustomTime, buildRouter } from "../router.js";
import { InMemoryReminderRepository } from "../../app/use-cases/__tests__/helpers/in-memory-repo.js";
import { Reminder } from "../../domain/reminder.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";
import type { SourceSnapshot } from "../../domain/value-objects/source-snapshot.js";

const TZ = "Europe/Kyiv";
const OWNER_ID = 123456789;
const OWNER_CHAT_ID = OWNER_ID;

function makeSnapshot(id = 1): SourceSnapshot {
  return {
    id,
    chatId: 100,
    messageId: 200 + id,
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
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

// --- parseCustomTime unit tests ---

describe("parseCustomTime (AC-03/AC-08)", () => {
  it("parses 'за 2 год' as now + 2 hours", () => {
    const before = Date.now();
    const result = parseCustomTime("за 2 год", TZ);
    const after = Date.now();
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(before + 2 * 3600_000 - 100);
    expect(result!).toBeLessThanOrEqual(after + 2 * 3600_000 + 100);
  });

  it("parses 'за 30 хв' as now + 30 minutes", () => {
    const before = Date.now();
    const result = parseCustomTime("за 30 хв", TZ);
    const after = Date.now();
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(before + 30 * 60_000 - 100);
    expect(result!).toBeLessThanOrEqual(after + 30 * 60_000 + 100);
  });

  it("parses 'завтра 15:00' as tomorrow 15:00 in Owner timezone", () => {
    const fakeNow = new Date("2026-06-13T10:00:00Z").getTime();
    vi.setSystemTime(fakeNow);

    const result = parseCustomTime("завтра 15:00", TZ);
    vi.useRealTimers();

    expect(result).not.toBeNull();
    const formatted = new Intl.DateTimeFormat("uk", {
      timeZone: TZ,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
      hour12: false,
    }).format(new Date(result!));
    expect(formatted).toContain("14.06");
    expect(formatted).toContain("15:00");
  });

  it("parses 'DD.MM.YYYY HH:MM' structured format", () => {
    const result = parseCustomTime("20.06.2026 09:30", TZ);
    expect(result).not.toBeNull();
    const formatted = new Intl.DateTimeFormat("uk", {
      timeZone: TZ,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
      hour12: false,
    }).format(new Date(result!));
    expect(formatted).toContain("20.06.2026");
    expect(formatted).toContain("09:30");
  });

  it("parses 'DD.MM.YYYY' (no time) as 09:00", () => {
    const result = parseCustomTime("25.12.2026", TZ);
    expect(result).not.toBeNull();
    const formatted = new Intl.DateTimeFormat("uk", {
      timeZone: TZ,
      hour: "2-digit", minute: "2-digit",
      hour12: false,
    }).format(new Date(result!));
    expect(formatted).toBe("09:00");
  });

  it("parses 'HH:MM' time-only as next future occurrence", () => {
    const fakeNow = new Date("2026-06-13T10:00:00Z").getTime(); // 13:00 Kyiv
    vi.setSystemTime(fakeNow);

    const result = parseCustomTime("15:00", TZ);
    vi.useRealTimers();

    expect(result).not.toBeNull();
    const formatted = new Intl.DateTimeFormat("uk", {
      timeZone: TZ,
      hour: "2-digit", minute: "2-digit",
      hour12: false,
    }).format(new Date(result!));
    expect(formatted).toBe("15:00");
  });

  it("returns null for unrecognized input (AC-08)", () => {
    expect(parseCustomTime("щось незрозуміле", TZ)).toBeNull();
    expect(parseCustomTime("32.13.2026 09:00", TZ)).toBeNull();
    expect(parseCustomTime("", TZ)).toBeNull();
  });

  it("returns non-null for past time (caller must reject) (AC-08)", () => {
    const result = parseCustomTime("01.01.2020 09:00", TZ);
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(Date.now());
  });
});

// --- Router integration tests for custom-time flow ---

describe("Router: custom-time conversation flow (AC-03/AC-08)", () => {
  let repo: InMemoryReminderRepository;
  let gateway: TelegramGateway;
  let router: ReturnType<typeof buildRouter>;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, TZ);
    gateway = makeGateway();
    router = buildRouter(repo, gateway, OWNER_CHAT_ID);
    router.pendingCustom.clear();
  });

  function makeCallbackCtx(data: string) {
    return {
      from: { id: OWNER_ID },
      callbackQuery: { id: "cq1", data },
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
    };
  }

  function makeTextCtx(text: string) {
    return {
      from: { id: OWNER_ID },
      message: { text },
      callbackQuery: undefined,
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("qpick custom → sets pending state and asks for time input (AC-03)", async () => {
    const r = Reminder.reconstitute({ id: 5, snapshot: makeSnapshot(5), state: "awaiting_time" });
    repo.reminders.set(5, r);

    const ctx = makeCallbackCtx("qpick:5:custom");
    await router.handleUpdate(ctx as any);

    expect(ctx.reply).toHaveBeenCalled();
    const prompt: string = (ctx.reply as any).mock.calls[0][0];
    expect(prompt).toMatch(/час|введіть/i);
    expect(router.pendingCustom.has(OWNER_CHAT_ID)).toBe(true);
  });

  it("valid future custom time schedules the reminder (AC-03)", async () => {
    const r = Reminder.reconstitute({ id: 6, snapshot: makeSnapshot(6), state: "awaiting_time" });
    repo.reminders.set(6, r);

    router.pendingCustom.set(OWNER_CHAT_ID, { type: "capture", reminderId: 6 });

    const ctx = makeTextCtx("20.06.2026 15:00");
    await router.handleUpdate(ctx as any);

    const updated = await repo.findById(6);
    expect(updated!.state).toBe("pending");
    expect(updated!.scheduledAt).not.toBeNull();
    expect(ctx.reply).toHaveBeenCalled();
    const confirmMsg: string = (ctx.reply as any).mock.calls[0][0];
    expect(confirmMsg).toMatch(/заплановано/i);
    expect(router.pendingCustom.has(OWNER_CHAT_ID)).toBe(false);
  });

  it("past custom time is rejected and prompt stays open (AC-08)", async () => {
    const r = Reminder.reconstitute({ id: 7, snapshot: makeSnapshot(7), state: "awaiting_time" });
    repo.reminders.set(7, r);

    router.pendingCustom.set(OWNER_CHAT_ID, { type: "capture", reminderId: 7 });

    const ctx = makeTextCtx("01.01.2020 09:00");
    await router.handleUpdate(ctx as any);

    const updated = await repo.findById(7);
    expect(updated!.state).toBe("awaiting_time");
    expect(router.pendingCustom.has(OWNER_CHAT_ID)).toBe(true);
    const errMsg: string = (ctx.reply as any).mock.calls[0][0];
    expect(errMsg).toMatch(/майбутн|future/i);
  });

  it("snooze-via-custom on an already-resolved reminder replies 'already resolved' instead of throwing (AC-10)", async () => {
    const r = Reminder.reconstitute({ id: 9, snapshot: makeSnapshot(9), state: "done" });
    repo.reminders.set(9, r);

    router.pendingCustom.set(OWNER_CHAT_ID, { type: "snooze", reminderId: 9 });

    const ctx = makeTextCtx("20.06.2026 15:00");
    await router.handleUpdate(ctx as any);

    const updated = await repo.findById(9);
    expect(updated!.state).toBe("done");
    expect(ctx.reply).toHaveBeenCalled();
    const msg: string = (ctx.reply as any).mock.calls[0][0];
    expect(msg).toMatch(/вже вирішено|already resolved/i);
    expect(gateway.editMessageToPlaceholder).not.toHaveBeenCalled();
  });

  it("unrecognized custom time text is rejected and prompt stays open (AC-08)", async () => {
    const r = Reminder.reconstitute({ id: 8, snapshot: makeSnapshot(8), state: "awaiting_time" });
    repo.reminders.set(8, r);

    router.pendingCustom.set(OWNER_CHAT_ID, { type: "capture", reminderId: 8 });

    const ctx = makeTextCtx("некоректний текст");
    await router.handleUpdate(ctx as any);

    const updated = await repo.findById(8);
    expect(updated!.state).toBe("awaiting_time");
    expect(router.pendingCustom.has(OWNER_CHAT_ID)).toBe(true);
    const errMsg: string = (ctx.reply as any).mock.calls[0][0];
    expect(errMsg).toMatch(/не вдалося|не розпізнати/i);
  });
});
