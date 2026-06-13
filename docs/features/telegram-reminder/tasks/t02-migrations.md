---
id: T02
title: "Promote staged migrations + write migration runner"
layer: "migration"
deps: ["T01"]
acs: []
files_hint:
  - migrations/01_create_owner_settings.up.sql
  - migrations/01_create_owner_settings.down.sql
  - migrations/02_create_source_snapshots.up.sql
  - migrations/02_create_source_snapshots.down.sql
  - migrations/03_create_reminders.up.sql
  - migrations/03_create_reminders.down.sql
  - src/infra/db/migrate.ts
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T02 — Promote staged migrations + write migration runner

## Why

Three SQL migration files are staged in `docs/features/telegram-reminder/migrations/` (data-model.md §Migration staging). They must be promoted into the live `migrations/` tree and a custom runner written so the schema is applied at boot. All data-bearing use cases (T05–T07, T08) require the schema to exist.

## What

1. Promote `docs/features/telegram-reminder/migrations/0{1,2,3}_*.{up,down}.sql` → `migrations/` (root-level, same filenames).
2. Write `src/infra/db/migrate.ts` — sequential custom runner:
   - Creates `_migrations` tracking table `IF NOT EXISTS` at boot.
   - Executes `PRAGMA foreign_keys = ON` on every connection (data-model.md FK note).
   - Applies each `NN_*.up.sql` in ascending numeric order; skips already-applied files.
   - `migrate:down` runs the matching `NN_*.down.sql` in reverse order.
3. `npm run migrate:up` and `npm run migrate:down` scripts in `package.json`.

Schema produced (from `data-model.md`): `owner_settings` (singleton, CHECK id=1) · `source_snapshots` · `reminders` (state CHECK, FK → snapshots) + `idx_reminders_state_scheduled_at` + `idx_reminders_snapshot_id`.

## Definition of Done

- [ ] `npm run migrate:up` applies all 3 migrations on a fresh DB without errors
- [ ] `npm run migrate:down` reverts all 3 cleanly (tables absent after down)
- [ ] Re-running `migrate:up` is idempotent (skips already-applied files)
- [ ] `PRAGMA foreign_keys = ON` is confirmed active after runner opens the connection
- [ ] lint + vet clean

## Notes

`layer: migration` — `implement` serializes this task (ordered sequence). Staged source files are under `docs/features/telegram-reminder/migrations/`; this task promotes them into the live `migrations/` root. Do not edit the SQL content — they were authored by the `data-model` skill.
