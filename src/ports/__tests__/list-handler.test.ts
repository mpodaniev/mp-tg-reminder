import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleList, handleListCancel } from "../handlers/list-handler.js";
import { handleSource } from "../handlers/source-handler.js";
import { ListActiveReminders } from "../../app/use-cases/list-active-reminders.js";
import { CancelPendingReminder } from "../../app/use-cases/cancel-pending-reminder.js";
import { InMemoryReminderRepository } from "../../app/use-cases/__tests__/helpers/in-memory-repo.js";
import { Reminder } from "../../domain/reminder.js";
import type { ReminderState } from "../../domain/state-machine.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";
import type { SourceSnapshot } from "../../domain/value-objects/source-snapshot.js";

const OWNER_ID = 123456789;
const NON_OWNER_ID = 999999;
const TZ = "Europe/Kyiv";

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
  return Reminder.reconstitute({ id, snapshot: snapshot(id, text), state: "pending", scheduledAt });
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

function makeCtx(fromId: number) {
  return { from: { id: fromId }, reply: vi.fn().mockResolvedValue(undefined) };
}

describe("handleList — /list command handler (T6)", () => {
  let repo: InMemoryReminderRepository;
  let listUC: ListActiveReminders;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, TZ);
    listUC = new ListActiveReminders(repo);
  });

  it("sends exactly one no-active-reminders message when empty (AC-02)", async () => {
    const ctx = makeCtx(OWNER_ID);
    await handleList(ctx as any, repo, listUC);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const [text] = ctx.reply.mock.calls[0]!;
    expect(text.toLowerCase()).toMatch(/немає активних/);
  });

  it("renders one message: rows with preview, owner-tz fire time, cancel+source buttons (AC-01)", async () => {
    // 2026-06-20T11:30:00Z → 14:30 in Europe/Kyiv (UTC+3)
    const fireMs = Date.UTC(2026, 5, 20, 11, 30, 0);
    repo.reminders.set(1, pending(1, fireMs, "buy milk"));
    repo.reminders.set(2, pending(2, fireMs + 3_600_000, "call Bob"));

    const ctx = makeCtx(OWNER_ID);
    await handleList(ctx as any, repo, listUC);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const [text, opts] = ctx.reply.mock.calls[0]!;
    expect(text).toContain("buy milk");
    expect(text).toContain("call Bob");
    // absolute local date-time in the owner's home tz (Europe/Kyiv = UTC+3)
    expect(text).toContain("14:30");

    const keyboard = opts.reply_markup.inline_keyboard.flat();
    const cancelBtn = keyboard.find((b: any) => b.callback_data === "cancel:1");
    const sourceBtn = keyboard.find((b: any) => b.callback_data === "source:1");
    expect(cancelBtn).toBeDefined();
    expect(sourceBtn).toBeDefined();
    expect(keyboard.some((b: any) => b.callback_data === "cancel:2")).toBe(true);
    expect(keyboard.some((b: any) => b.callback_data === "source:2")).toBe(true);
  });

  it("appends the overflow indicator and still sends exactly one message (AC-08)", async () => {
    for (let i = 1; i <= 60; i++) {
      repo.reminders.set(i, pending(i, 1_000_000 + i, "r"));
    }
    const ctx = makeCtx(OWNER_ID);
    await handleList(ctx as any, repo, listUC);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const [text] = ctx.reply.mock.calls[0]!;
    expect(text).toMatch(/ще\s+10/);
  });

  it("hits the 4096-char budget before the row cap and still sends exactly one message with an overflow indicator (AC-08)", async () => {
    // long previews (~100 chars each) blow the char budget well before MAX_ACTIVE_LIST_ROWS
    for (let i = 1; i <= 50; i++) {
      repo.reminders.set(i, pending(i, 1_000_000 + i, "y".repeat(100)));
    }
    const ctx = makeCtx(OWNER_ID);
    await handleList(ctx as any, repo, listUC);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const [text] = ctx.reply.mock.calls[0]!;
    expect(text).toMatch(/ще\s+\d+/);
    // earliest-added (lowest id) rows are the ones kept
    expect(text).toContain("y".repeat(100).slice(0, 20));
  });

  it("reveals nothing to a non-Owner (AC-05)", async () => {
    repo.reminders.set(1, pending(1, 1000, "secret"));
    const ctx = makeCtx(NON_OWNER_ID);
    await handleList(ctx as any, repo, listUC);

    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("marks fired rows with a distinct flag and omits Cancel; scheduled rows keep Cancel (AC-02/AC-05)", async () => {
    const fireMs = Date.UTC(2026, 5, 20, 11, 30, 0);
    repo.reminders.set(1, pending(1, fireMs, "still scheduled"));
    repo.reminders.set(2, fired(2, "already fired"));

    const ctx = makeCtx(OWNER_ID);
    await handleList(ctx as any, repo, listUC);

    const [text, opts] = ctx.reply.mock.calls[0]!;
    const lines = text.split("\n");
    const scheduledLine = lines.find((l: string) => l.includes("still scheduled"));
    const firedLine = lines.find((l: string) => l.includes("already fired"));
    expect(scheduledLine).not.toEqual(firedLine);
    expect(firedLine).toMatch(/спрацювал/i);
    expect(scheduledLine).not.toMatch(/спрацювал/i);

    const keyboard = opts.reply_markup.inline_keyboard.flat();
    expect(keyboard.some((b: any) => b.callback_data === "cancel:1")).toBe(true);
    expect(keyboard.some((b: any) => b.callback_data === "cancel:2")).toBe(false);
    expect(keyboard.some((b: any) => b.callback_data === "source:2")).toBe(true);
    // A fired row has no Cancel, but it must offer Delete directly from the
    // list — the Owner shouldn't have to hunt down the original fired
    // message in chat just to clear it (AC-09, added-by-fix).
    expect(keyboard.some((b: any) => b.callback_data === "delete:2")).toBe(true);
    // A still-scheduled row has no Delete — it isn't resolved yet, Cancel is
    // its only exit.
    expect(keyboard.some((b: any) => b.callback_data === "delete:1")).toBe(false);
  });

  it("emits a structured timing log around the list use-case (NFR §6 / QG-3)", async () => {
    repo.reminders.set(1, pending(1, Date.now() + 60_000, "anything"));
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const ctx = makeCtx(OWNER_ID);

    await handleList(ctx as any, repo, listUC);

    const entry = infoSpy.mock.calls
      .map((c) => c[0])
      .find((a) => a && typeof a === "object" && (a as any).module === "list");
    expect(entry).toBeDefined();
    expect((entry as any).event).toBe("list_rendered");
    expect(typeof (entry as any).elapsedMs).toBe("number");
    infoSpy.mockRestore();
  });
});

function makeCallbackCtx() {
  return {
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    // exposed so a regression that starts editing the rendered list message
    // (violating the ADR-0002 immutable snapshot) is caught.
    editMessageText: vi.fn().mockResolvedValue(undefined),
  };
}

function makeGateway(): TelegramGateway {
  return {
    sendReminder: vi.fn().mockResolvedValue({ messageId: 1 }),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editMessageToPlaceholder: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

describe("handleListCancel — cancel callback (T7, AC-03/AC-04)", () => {
  let repo: InMemoryReminderRepository;
  let cancelUC: CancelPendingReminder;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, TZ);
    cancelUC = new CancelPendingReminder(repo);
  });

  it("cancels a pending reminder and confirms in a separate message (AC-03)", async () => {
    repo.reminders.set(1, pending(1, Date.now() + 60_000, "doomed"));
    const ctx = makeCallbackCtx();

    await handleListCancel(ctx as any, cancelUC, 1);

    expect((await repo.findById(1))!.state).toBe("deleted");
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const [text] = ctx.reply.mock.calls[0]!;
    expect(text.toLowerCase()).toMatch(/скасован/);
    // the rendered list message is a frozen point-in-time snapshot — confirm
    // the cancel path never edits it (ADR-0002 / AC-03).
    expect(ctx.editMessageText).not.toHaveBeenCalled();
  });

  it.each<ReminderState>(["firing", "fired", "done", "deleted", "expired"])(
    "shows the uniform no-longer-active no-op for non-pending state '%s' with no state change (AC-04)",
    async (state) => {
      const r = Reminder.reconstitute({ id: 2, snapshot: snapshot(2, "stale"), state });
      repo.reminders.set(2, r);
      const ctx = makeCallbackCtx();

      await handleListCancel(ctx as any, cancelUC, 2);

      expect((await repo.findById(2))!.state).toBe(state);
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledTimes(1);
      const [text] = ctx.reply.mock.calls[0]!;
      expect(text.toLowerCase()).toMatch(/більше не активне/);
    }
  );

  it("shows the uniform no-op without crashing when the reminder row is absent (AC-04)", async () => {
    // nothing seeded → findById returns null (e.g. a since-purged row); a stale
    // tap must never escape to bot.catch (ADR-0002 immutable snapshot).
    const ctx = makeCallbackCtx();

    await handleListCancel(ctx as any, cancelUC, 404);

    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const [text] = ctx.reply.mock.calls[0]!;
    expect(text.toLowerCase()).toMatch(/більше не активне/);
  });

  it("the uniform no-op message is identical for every non-pending end state (AC-04)", async () => {
    const messages: string[] = [];
    for (const state of ["firing", "fired", "done", "deleted", "expired"] as ReminderState[]) {
      repo.reminders.set(3, Reminder.reconstitute({ id: 3, snapshot: snapshot(3, "x"), state }));
      const ctx = makeCallbackCtx();
      await handleListCancel(ctx as any, cancelUC, 3);
      messages.push(ctx.reply.mock.calls[0]![0]);
    }
    expect(new Set(messages).size).toBe(1);
  });
});

describe("go-to-source from the list reuses the fired-reminder fallback (T7, AC-06)", () => {
  let repo: InMemoryReminderRepository;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, TZ);
  });

  it("sends a deep link when the source chat has a public username", async () => {
    const snap: SourceSnapshot = { ...snapshot(1, "linkable"), chatUsername: "publicchat", messageId: 555 };
    repo.reminders.set(1, Reminder.reconstitute({ id: 1, snapshot: snap, state: "pending", scheduledAt: Date.now() + 1000 }));
    const gateway = makeGateway();
    const ctx = makeCallbackCtx();

    await handleSource(ctx as any, repo, gateway, 1, OWNER_ID);

    const [, text] = (gateway.sendMessage as any).mock.calls[0];
    expect(text).toContain("t.me/publicchat/555");
  });

  it("falls back to inline content when there is no public username (AC-06)", async () => {
    const snap: SourceSnapshot = { ...snapshot(2, "private body"), chatUsername: null };
    repo.reminders.set(2, Reminder.reconstitute({ id: 2, snapshot: snap, state: "pending", scheduledAt: Date.now() + 1000 }));
    const gateway = makeGateway();
    const ctx = makeCallbackCtx();

    await handleSource(ctx as any, repo, gateway, 2, OWNER_ID);

    const [, text] = (gateway.sendMessage as any).mock.calls[0];
    expect(text).toContain("private body");
  });
});
