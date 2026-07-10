import { Bot } from "grammy";
import { openDb } from "./infra/db/open-db.js";
import { SqliteReminderRepository } from "./infra/db/sqlite-reminder-repository.js";
import { SqlitePendingPromptRepository } from "./infra/db/sqlite-pending-prompt-repository.js";
import { GrammyTelegramGateway } from "./infra/telegram/grammy-telegram-gateway.js";
import { FireDueReminders } from "./app/use-cases/fire-due-reminders.js";
import { ExpireStalePrompts } from "./app/use-cases/expire-stale-prompts.js";
import { Scheduler } from "./scheduler/scheduler.js";
import { buildRouter } from "./ports/router.js";
import { buildHttpServer } from "./ports/http/server.js";
import { buildWebhookHandler } from "./ports/http/webhook-handler.js";
import { buildWakeHandler } from "./ports/http/wake-handler.js";

const BOT_TOKEN = process.env["BOT_TOKEN"];
const OWNER_TELEGRAM_ID = parseInt(process.env["OWNER_TELEGRAM_ID"] ?? "", 10);
const DB_PATH = process.env["DB_PATH"] ?? "./data/reminders.db";
const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
const WEBHOOK_URL = process.env["WEBHOOK_URL"];
const WEBHOOK_SECRET_TOKEN = process.env["WEBHOOK_SECRET_TOKEN"];
const WAKE_BEARER_TOKEN = process.env["WAKE_BEARER_TOKEN"];
// The AC-03 delivery-delay estimate must reflect the external scheduler's real
// cadence, so it shares one config value with the cron that calls POST /wake.
// Keep this in sync with that scheduler's interval (sad.md §7 default: 3 min).
const WAKE_INTERVAL_MS = parseInt(process.env["WAKE_INTERVAL_MS"] ?? "", 10) || 3 * 60 * 1000;

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN is required");
  process.exit(1);
}
if (isNaN(OWNER_TELEGRAM_ID)) {
  console.error("OWNER_TELEGRAM_ID must be a valid integer");
  process.exit(1);
}
if (!WEBHOOK_URL) {
  console.error("WEBHOOK_URL is required (e.g. https://<fly-app>.fly.dev/webhook/telegram)");
  process.exit(1);
}
if (!WEBHOOK_SECRET_TOKEN) {
  console.error("WEBHOOK_SECRET_TOKEN is required");
  process.exit(1);
}
if (!WAKE_BEARER_TOKEN) {
  console.error("WAKE_BEARER_TOKEN is required");
  process.exit(1);
}

const db = openDb(DB_PATH);
const repo = new SqliteReminderRepository(db);
const pendingPromptRepo = new SqlitePendingPromptRepository(db);

// Bootstrap owner settings if not present
const existing = await repo.getOwnerSettings();
if (!existing) {
  await repo.upsertOwnerSettings(OWNER_TELEGRAM_ID, null);
}

const bot = new Bot(BOT_TOKEN);

const gateway = new GrammyTelegramGateway({
  sendMessage: (chatId, text, opts) =>
    bot.api.sendMessage(chatId, text, opts),
  deleteMessage: (chatId, messageId) =>
    bot.api.deleteMessage(chatId, messageId),
  editMessageText: (chatId, messageId, text, opts) =>
    bot.api.editMessageText(chatId, messageId, text, opts),
  answerCallbackQuery: (id, opts) =>
    bot.api.answerCallbackQuery(id, opts),
});

const OWNER_CHAT_ID = OWNER_TELEGRAM_ID;
const fireUC = new FireDueReminders(repo, gateway, OWNER_CHAT_ID);
const expireUC = new ExpireStalePrompts(repo);
const scheduler = new Scheduler(fireUC, expireUC, 24 * 60 * 60 * 1000);
const router = buildRouter(repo, gateway, OWNER_CHAT_ID, pendingPromptRepo, WAKE_INTERVAL_MS);

// Register the /list and /stats commands in the Telegram command menu, scoped
// to the Owner's chat so they are never offered to other users (owner-only
// posture, AC-05/AC-07).
try {
  await bot.api.setMyCommands(
    [
      { command: "list", description: "Активні нагадування" },
      { command: "stats", description: "Статистика нагадувань" },
    ],
    { scope: { type: "chat", chat_id: OWNER_CHAT_ID } }
  );
} catch (err) {
  console.warn({ module: "bot", event: "setMyCommands_failed", error: String(err) });
}

bot.on("message", async (ctx) => {
  await router.handleUpdate(ctx);
});

bot.on("callback_query", async (ctx) => {
  await router.handleUpdate(ctx);
});

bot.catch((err) => {
  console.error({ module: "bot", event: "error", error: err.message });
});

// Webhook mode (ADR-0001/ADR-0002): no long-polling, no in-process timer — the
// machine can fully idle between an inbound webhook update and the next
// external wake call. bot.init() fetches bot info once; bot.handleUpdate()
// feeds each verified webhook body into the same grammy Context + router
// dispatch that bot.start() would have used under long-polling.
await bot.init();
await bot.api.setWebhook(WEBHOOK_URL, { secret_token: WEBHOOK_SECRET_TOKEN });

const httpServer = buildHttpServer({
  webhook: buildWebhookHandler({ handleUpdate: (update) => bot.handleUpdate(update as never) }, WEBHOOK_SECRET_TOKEN),
  wake: buildWakeHandler(scheduler, WAKE_BEARER_TOKEN),
});

httpServer.listen(PORT, () => {
  console.log({ module: "http", event: "listening", port: PORT });
});

function shutdown(): void {
  console.log({ module: "main", event: "shutdown" });
  httpServer.close();
  void scheduler.stop().then(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
