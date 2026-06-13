---
id: T13
title: "Composition root main.ts — wire all adapters, start long-poll + scheduler"
layer: "wiring"
deps: ["T08", "T10", "T11", "T12"]
acs: []
files_hint:
  - src/main.ts
  - src/infra/db/open-db.ts
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T13 — Composition root main.ts + startup wiring

## Why

The composition root is the single place where adapters are instantiated and injected into use cases and handlers ([ADR-0006](../adr/0006-ports-and-adapters-layering.md) §composition root). No other file may import concrete infra classes directly.

## What

**`src/infra/db/open-db.ts`** — helper that:
1. Opens a `better-sqlite3` database at `process.env.DB_PATH`.
2. Sets WAL mode: `PRAGMA journal_mode = WAL`.
3. Enables FK enforcement: `PRAGMA foreign_keys = ON`.
4. Runs the migration runner (T02) to apply pending migrations at boot.

**`src/main.ts`** — sequential boot:
1. Load and validate env vars (`BOT_TOKEN`, `OWNER_TELEGRAM_ID`, `DB_PATH`, `SCHEDULER_INTERVAL_MS`).
2. `openDb()` → migrate → ready.
3. Instantiate `SqliteReminderRepository(db)` (T08).
4. Instantiate `Bot(BOT_TOKEN)` (grammY).
5. Instantiate `GrammyTelegramGateway(bot)` (T09).
6. Instantiate all use cases (T05–T07), passing repo + gateway as needed.
7. Instantiate and register `router(bot, useCases)` (T10 + T11).
8. Instantiate `Scheduler(fireDueReminders, expireStalePrompts, SCHEDULER_INTERVAL_MS)` (T12); `scheduler.start()`.
9. `bot.start()` — begins long-polling (ADR-0003).
10. Graceful shutdown on `SIGTERM`/`SIGINT`: `scheduler.stop()` → `bot.stop()` → `db.close()`.

## Definition of Done

- [ ] `npm start` boots the bot without errors against a real `BOT_TOKEN` (smoke test; requires a test bot token)
- [ ] Missing required env var exits with a clear error message before touching the DB
- [ ] Migration runner applies pending migrations on each boot (idempotent)
- [ ] Graceful shutdown clears the scheduler and closes the DB cleanly
- [ ] No concrete infra class imported outside `main.ts` and `open-db.ts`
- [ ] lint + vet clean

## Notes

Derives from [sad §5](../sad.md) and [sad §7 deployment view](../sad.md). `OWNER_TELEGRAM_ID` is used to seed `owner_settings.ownerTelegramId` on first boot if the table is empty — or the Owner sets it via `/settings`. Decide at implementation time which path to take; `/settings` is simpler and already designed in T10.
