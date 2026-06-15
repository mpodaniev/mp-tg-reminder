import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleList } from "../handlers/list-handler.js";
import { ListActiveReminders } from "../../app/use-cases/list-active-reminders.js";
import { InMemoryReminderRepository } from "../../app/use-cases/__tests__/helpers/in-memory-repo.js";
import { Reminder } from "../../domain/reminder.js";
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

  it("reveals nothing to a non-Owner (AC-05)", async () => {
    repo.reminders.set(1, pending(1, 1000, "secret"));
    const ctx = makeCtx(NON_OWNER_ID);
    await handleList(ctx as any, repo, listUC);

    expect(ctx.reply).not.toHaveBeenCalled();
  });
});
