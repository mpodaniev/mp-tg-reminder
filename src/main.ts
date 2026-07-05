import { Bot } from "grammy";
import { openDb } from "./infra/db/open-db.js";
import { SqliteReminderRepository } from "./infra/db/sqlite-reminder-repository.js";
import { SqlitePendingPromptRepository } from "./infra/db/sqlite-pending-prompt-repository.js";
import { GrammyTelegramGateway } from "./infra/telegram/grammy-telegram-gateway.js";
import { FireDueReminders } from "./app/use-cases/fire-due-reminders.js";
import { ExpireStalePrompts } from "./app/use-cases/expire-stale-prompts.js";
import { Scheduler } from "./scheduler/scheduler.js";
import { buildRouter } from "./ports/router.js";

const BOT_TOKEN = process.env["BOT_TOKEN"];
const OWNER_TELEGRAM_ID = parseInt(process.env["OWNER_TELEGRAM_ID"] ?? "", 10);
const DB_PATH = process.env["DB_PATH"] ?? "./data/reminders.db";

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN is required");
  process.exit(1);
}
if (isNaN(OWNER_TELEGRAM_ID)) {
  console.error("OWNER_TELEGRAM_ID must be a valid integer");
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
const router = buildRouter(repo, gateway, OWNER_CHAT_ID, pendingPromptRepo);

// Register the /list command in the Telegram command menu, scoped to the Owner's
// chat so it is never offered to other users (owner-only posture, AC-05/AC-07).
try {
  await bot.api.setMyCommands(
    [{ command: "list", description: "Активні нагадування" }],
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

await bot.start();

process.on("SIGTERM", () => {
  void scheduler.stop().then(() => {
    db.close();
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  void scheduler.stop().then(() => {
    db.close();
    process.exit(0);
  });
});
