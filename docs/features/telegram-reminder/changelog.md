# Changelog — telegram-reminder

## telegram-reminder — Personal Telegram bot that captures forwarded messages as durable reminders

**What:** A personal Telegram bot that lets the Owner forward any Telegram message to the bot, set a reminder time (quick-pick or custom), and receive the original content back at the scheduled time with one-tap inline actions (Snooze / Done / Delete / Go to source). Resolved reminders are deleted from the bot chat — an empty chat means a fully cleared inbox.

**Why:** Important messages were being buried in chat history with no lightweight in-Telegram way to defer attention. See [spec §1](./spec.md) for context. Key architectural decisions:
- [ADR-0001](./adr/0001-node-typescript-grammy-runtime.md) — Node.js + TypeScript + grammY for type-safe bot runtime.
- [ADR-0002](./adr/0002-sqlite-embedded-store.md) — Embedded SQLite (WAL mode) for zero-infrastructure durable storage.
- [ADR-0004](./adr/0004-polling-tick-scheduler.md) — Polling-tick scheduler (~15 s) with the store as source of truth, making durability a structural property.
- [ADR-0005](./adr/0005-at-least-once-delivery.md) — At-least-once delivery with a `firing` → `fired` + `delivered_at` confirmation: reminders survive a mid-fire crash and are never silently lost.
- [ADR-0006](./adr/0006-ports-and-adapters-layering.md) — Ports-and-adapters (hexagonal) architecture so the at-least-once firing logic is tested in full isolation, without Telegram or disk.

**How to use:**
1. Set `BOT_TOKEN` (from BotFather) and `OWNER_CHAT_ID` in the environment (see `src/main.ts`).
2. Run `npm run build && node dist/main.js` (or `npx ts-node src/main.ts` in dev).
3. In Telegram: send `/settings` to set your IANA timezone (required before capture).
4. Forward any message to the bot → tap a quick-pick or "Custom time" → reminder is set.
5. At the scheduled time the bot sends the reminder back with Snooze / Done / Delete / Go to source buttons.

**Operational notes:**
- **Migrations:** adds three SQLite migrations applied automatically at startup via `src/infra/db/migrate.ts`:
  - `01_create_owner_settings` — IANA timezone per owner.
  - `02_create_source_snapshots` — captured message content + source metadata.
  - `03_create_reminders` — reminder lifecycle (pending → firing → fired → done/deleted), `scheduled_at`, `delivered_at`.
  - Rollback: `migrate down` (down-scripts provided) then revert the deploy.
- **Feature flag / config:** none — bot is always-on once started.
- **SQLite file path:** defaults to `./data/reminders.db`; override via `DB_PATH` env var.

**Acceptance criteria delivered:** AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13.
