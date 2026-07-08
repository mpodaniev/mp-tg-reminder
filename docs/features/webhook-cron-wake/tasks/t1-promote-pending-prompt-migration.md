---
id: T1
title: "Promote and validate the staged pending_prompt migration"
layer: "migration"
deps: []
acs: ["AC-05"]
files_hint: ["docs/features/webhook-cron-wake/migrations/01_create_pending_prompt.up.sql", "docs/features/webhook-cron-wake/migrations/01_create_pending_prompt.down.sql"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T1 — Promote and validate the staged pending_prompt migration

## Why

The durable "awaiting custom time" prompt (spec [AC-05](../spec.md)) needs a table to replace the in-memory `pendingCustom` map. The shape and rationale are already staged — see [data-model.md](../data-model.md) and [sad.md §5 decision 2](../sad.md).

## What

Promote the staged pair at `docs/features/webhook-cron-wake/migrations/01_create_pending_prompt.{up,down}.sql` into the live `migrations/` tree (next number in sequence after `03_create_reminders`), following the repo's Flyway-style convention (`src/infra/db/migrate.ts`). No SQL content changes expected — the staged files already match the repo's singleton-table (`owner_settings`) and FK-index conventions.

## Definition of Done

- [ ] Migration promoted into the live `migrations/` directory with the correct next sequence number
- [ ] `npm run migrate:up` applies cleanly against a fresh DB; `npm run migrate:down` reverts cleanly
- [ ] `_migrations` tracking table records the new migration after `up`
- [ ] lint + vet clean

## Notes

No production code depends on this table yet — T2/T3 build the port and implementation on top of it. Keep this task scoped to the migration only.
