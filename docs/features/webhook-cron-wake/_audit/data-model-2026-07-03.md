# Data-model audit — webhook-cron-wake — 2026-07-03

## Scope

One new entity: `pending_prompt` (singleton, replaces the in-memory `pendingCustom` map,
`src/ports/router.ts:19`), per spec AC-05 and `sad.md` §5 decision 2. No changes to
`owner_settings`, `source_snapshots`, or `reminders` — AC-06 (idempotent delivery) is already
satisfied by the existing `reminders.delivered_at` column (ADR-0005) plus the graceful-shutdown
drain (`sad.md` §4 decision 5); no schema change was needed for it.

## Convention source

- `docs/architecture-map.md` §Conventions: Flyway-style `NN_description.{up,down}.sql` in
  `migrations/`, tracked in `_migrations`, sorted-order apply (`src/infra/db/migrate.ts:24-42`);
  `INTEGER PRIMARY KEY AUTOINCREMENT` IDs; `better-sqlite3` synchronous access.
- `sad.md` §2 Constraints (same migration convention, confirms next live number is `04`) and §5
  building-block decision 2 (singleton-row shape for `pending_prompt`, modelled on
  `owner_settings`).
- Corroborated directly against the live `migrations/01-03_*.sql` files: singleton pattern
  (`owner_settings`: `id INTEGER PRIMARY KEY CHECK (id = 1)`), `CHECK` enum pattern (`reminders.state`),
  `created_at INTEGER NOT NULL` on every table, no `updated_at` anywhere, FK-index pairing
  (`idx_reminders_snapshot_id`).
- No divergence found — the new entity follows the repo's existing conventions exactly (singleton
  `CHECK (id = 1)`, `CHECK` enum, epoch-ms `created_at`, FK index).

## Staged migrations (NOT in the live tree)

- `docs/features/webhook-cron-wake/migrations/01_create_pending_prompt.up.sql`
- `docs/features/webhook-cron-wake/migrations/01_create_pending_prompt.down.sql`

**Promote-time hint:** the repo's migration numbering is sequential and the live tree currently
ends at `03_create_reminders.{up,down}.sql`; the next live number is **`04`** as of this writing.
`implement` assigns the real number at promotion time (in case another feature promotes first) —
these files are staged under the feature folder, not written into the live `migrations/` tree.

## Self-checks

| Check | Result |
|---|---|
| Naming matches repo convention | Pass — `snake_case` table/columns, `NN_verb_entity.{up,down}.sql` staged name |
| Down reversibility | Pass — `CREATE TABLE` ↔ `DROP TABLE`, `CREATE INDEX` ↔ `DROP INDEX`, both in `.down.sql` |
| FK indexes | Pass — `reminder_id REFERENCES reminders(id)` is backed by `idx_pending_prompt_reminder_id` |
| Convention adherence | Pass — matches `owner_settings`'s singleton `CHECK (id = 1)` shape, `reminders`' `CHECK` enum style, and the repo-wide `created_at`-only (no `updated_at`) audit-column pattern; no deviation to flag |

## Drift detection

Not applicable — `pending_prompt` is a wholly new table with no prior persisted representation to
diff against (today's equivalent, `PendingCustom`, is an in-memory `Map` in `src/ports/router.ts`,
not a domain/DB layer subject to field-vs-column drift). No `_drift/` files were generated.

## Open items / `<!-- TBD -->`

None — every column, constraint, and index in `data-model.md` was fully specified against a
concrete existing repo convention; nothing was left undecided.

## State

Migrations are **staged** under `docs/features/webhook-cron-wake/migrations/` — not yet in the
live `migrations/` tree. `implement` promotes them (assigning the real sequence number `04`,
per the hint above) when the `layer: migration` task for this feature is actually built.

Next stage: `/sdd:api webhook-cron-wake`.
