import { describe, it, expect, vi } from "vitest";
import Database from "better-sqlite3";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";
import type { AddressInfo } from "net";
import { runMigrationsUp } from "../../src/infra/db/migrate.js";
import { SqliteReminderRepository } from "../../src/infra/db/sqlite-reminder-repository.js";
import { SqlitePendingPromptRepository } from "../../src/infra/db/sqlite-pending-prompt-repository.js";
import { FireDueReminders } from "../../src/app/use-cases/fire-due-reminders.js";
import { ExpireStalePrompts } from "../../src/app/use-cases/expire-stale-prompts.js";
import { Scheduler } from "../../src/scheduler/scheduler.js";
import { buildRouter } from "../../src/ports/router.js";
import { buildHttpServer } from "../../src/ports/http/server.js";
import { buildWebhookHandler } from "../../src/ports/http/webhook-handler.js";
import { buildWakeHandler } from "../../src/ports/http/wake-handler.js";
import { Reminder } from "../../src/domain/reminder.js";
import type { TelegramGateway } from "../../src/app/ports/telegram-gateway.js";

const OWNER_ID = 123456789;
const TZ = "Europe/Kyiv";
const WEBHOOK_SECRET = "test-webhook-secret";
const WAKE_TOKEN = "test-wake-token";

function makeGateway(): TelegramGateway {
  return {
    sendReminder: vi.fn().mockResolvedValue({ messageId: 1 }),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editMessageToPlaceholder: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

// Minimal adapter from a raw Telegram Update JSON body to the ctx shape
// buildRouter's handleUpdate expects — mirrors what bot.handleUpdate() does
// in production (main.ts), without needing a real grammy Bot/network call.
function updateToCtx(update: any) {
  return {
    from: update.message?.from ?? update.callback_query?.from,
    message: update.message,
    callbackQuery: update.callback_query,
    reply: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
  };
}

async function setupStack(dbPath: string) {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  runMigrationsUp(db);

  const repo = new SqliteReminderRepository(db);
  await repo.upsertOwnerSettings(OWNER_ID, TZ);
  const pendingPromptRepo = new SqlitePendingPromptRepository(db);
  const gateway = makeGateway();
  const router = buildRouter(repo, gateway, OWNER_ID, pendingPromptRepo);
  const fireUC = new FireDueReminders(repo, gateway, OWNER_ID);
  const expireUC = new ExpireStalePrompts(repo);
  const scheduler = new Scheduler(fireUC, expireUC, 24 * 60 * 60 * 1000);

  const httpServer = buildHttpServer({
    webhook: buildWebhookHandler({ handleUpdate: async (u) => router.handleUpdate(updateToCtx(u)) }, WEBHOOK_SECRET),
    wake: buildWakeHandler(scheduler, WAKE_TOKEN),
  });

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  return { db, repo, pendingPromptRepo, gateway, router, scheduler, httpServer, baseUrl };
}

async function teardownStack(stack: { db: Database.Database; httpServer: import("http").Server }) {
  await new Promise<void>((resolve) => stack.httpServer.close(() => resolve()));
  stack.db.close();
}

function makeSnapshot(id: number) {
  return {
    chatId: 100, messageId: 200 + id, chatUsername: null,
    senderName: null, senderUsername: null, messageText: `test ${id}`,
    mediaFileId: null, mediaType: null, isMediaProtected: false, createdAt: Date.now(),
  };
}

// Force a reminder straight to state=pending with a past scheduledAt — simulates
// one that "became due during the gap" without going through schedule()'s
// future-only ScheduledTime.from() guard.
async function seedDueReminder(repo: SqliteReminderRepository, id: number, scheduledAtMs: number) {
  const created = await repo.saveWithSnapshot(makeSnapshot(id), Reminder.create({ snapshot: { ...makeSnapshot(id), id: 0 } }));
  const due = Reminder.reconstitute({
    id: created.id!,
    snapshot: created.snapshot,
    state: "pending",
    scheduledAt: scheduledAtMs,
  });
  await repo.update(due);
  return due;
}

describe("Integration: webhook + wake perimeter and catch-up (T14, AC-04/AC-05/AC-07)", () => {
  it("unauthenticated webhook and wake requests are rejected 100%, no Owner data changed (AC-04)", async () => {
    const dbPath = join(tmpdir(), `test-perimeter-${Date.now()}-${Math.random()}.db`);
    const stack = await setupStack(dbPath);
    try {
      // Unauthenticated webhook: forwarded-message update, no secret header.
      const webhookRes = await fetch(`${stack.baseUrl}/webhook/telegram`, {
        method: "POST",
        body: JSON.stringify({
          message: { forward_date: 1700000000, chat: { id: 100 }, text: "hijack", from: { id: OWNER_ID } },
        }),
      });
      expect(webhookRes.status).toBe(401);

      // Unauthenticated wake: no Authorization header.
      const dueReminder = await seedDueReminder(stack.repo, 2, Date.now() - 1000);

      const wakeRes = await fetch(`${stack.baseUrl}/wake`, { method: "POST" });
      expect(wakeRes.status).toBe(401);

      // No Owner data changed by either rejected request.
      const stillPending = await stack.repo.findById(dueReminder.id!);
      expect(stillPending!.state).toBe("pending");
      expect(stack.gateway.sendReminder).not.toHaveBeenCalled();
      const capturedCount =
        (await stack.repo.findVisibleOrdered()).length + (await stack.repo.findFiring()).length;
      expect(capturedCount).toBe(1); // only dueReminder — the hijack attempt created nothing
    } finally {
      await teardownStack(stack);
      try { unlinkSync(dbPath); } catch {}
    }
  });

  it("a pending prompt set before a simulated restart is honored after, over the real HTTP perimeter (AC-05)", async () => {
    const dbPath = join(tmpdir(), `test-perimeter-restart-${Date.now()}-${Math.random()}.db`);
    const stack1 = await setupStack(dbPath);
    let stack2: Awaited<ReturnType<typeof setupStack>> | undefined;
    try {
      const created = await stack1.repo.saveWithSnapshot(
        makeSnapshot(3),
        Reminder.create({ snapshot: { ...makeSnapshot(3), id: 0 } })
      );

      const qpickCustomRes = await fetch(`${stack1.baseUrl}/webhook/telegram`, {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": WEBHOOK_SECRET },
        body: JSON.stringify({
          callback_query: { id: "cq1", data: `qpick:${created.id}:custom`, from: { id: OWNER_ID } },
        }),
      });
      expect(qpickCustomRes.status).toBe(200);
      expect(await stack1.pendingPromptRepo.findPendingPrompt()).not.toBeNull();

      await teardownStack(stack1); // "restart": tear down this process's server/db handle

      stack2 = await setupStack(dbPath); // same DB file, brand-new instances

      const customTimeRes = await fetch(`${stack2.baseUrl}/webhook/telegram`, {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": WEBHOOK_SECRET },
        body: JSON.stringify({
          message: { text: "за 2 год", chat: { id: 100 }, from: { id: OWNER_ID } },
        }),
      });
      expect(customTimeRes.status).toBe(200);

      const updated = await stack2.repo.findById(created.id!);
      expect(updated!.state).toBe("pending");
      expect(await stack2.pendingPromptRepo.findPendingPrompt()).toBeNull();
    } finally {
      if (stack2) await teardownStack(stack2);
      try { unlinkSync(dbPath); } catch {}
    }
  });

  it("reminders that became due during a wake-cycle gap all fire once tick() next runs, none lost (AC-07)", async () => {
    const dbPath = join(tmpdir(), `test-perimeter-catchup-${Date.now()}-${Math.random()}.db`);
    const stack = await setupStack(dbPath);
    try {
      const dueIds: number[] = [];
      for (let i = 0; i < 3; i++) {
        const r = await seedDueReminder(stack.repo, 10 + i, Date.now() - (i + 1) * 60_000);
        dueIds.push(r.id!);
      }

      const wakeRes = await fetch(`${stack.baseUrl}/wake`, {
        method: "POST",
        headers: { authorization: `Bearer ${WAKE_TOKEN}` },
      });
      expect(wakeRes.status).toBe(200);

      expect(stack.gateway.sendReminder).toHaveBeenCalledTimes(3);
      for (const id of dueIds) {
        const updated = await stack.repo.findById(id);
        expect(updated!.state).toBe("fired");
      }
    } finally {
      await teardownStack(stack);
      try { unlinkSync(dbPath); } catch {}
    }
  });
});
