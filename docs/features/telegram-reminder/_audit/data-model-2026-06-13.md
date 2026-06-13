# Audit Report — data-model — telegram-reminder — 2026-06-13

## Staged migration files

Migrations are **staged** — not yet in the live `migrations/` tree.
`implement` promotes them (assigning the real sequence number per the custom-runner convention, in ordinal order).

| Staged file | Purpose |
|---|---|
| `docs/features/telegram-reminder/migrations/01_create_owner_settings.up.sql` | Singleton settings table |
| `docs/features/telegram-reminder/migrations/01_create_owner_settings.down.sql` | Drop owner_settings |
| `docs/features/telegram-reminder/migrations/02_create_source_snapshots.up.sql` | Source-message snapshot table |
| `docs/features/telegram-reminder/migrations/02_create_source_snapshots.down.sql` | Drop source_snapshots |
| `docs/features/telegram-reminder/migrations/03_create_reminders.up.sql` | Reminder table + indexes |
| `docs/features/telegram-reminder/migrations/03_create_reminders.down.sql` | Drop indexes + reminders |

**Promote-time hint:** repo uses custom runner — sequential `NN_<verb>_<entity>.{up,down}.sql` naming. No existing migrations → next real number starts at `01`. `implement` assigns the final numbers at promotion. No live `migrations/` tree exists yet.

## Schema decisions (greenfield — confirmed with user)

| Topic | Decision | Source |
|---|---|---|
| Migration tool | Custom TS runner (reads ordered SQL files via better-sqlite3 at startup) | User choice |
| Snapshot storage | Separate `source_snapshots` table with FK from `reminders` | User choice |
| Audit columns | `created_at` only on all tables | User choice |
| PK strategy | `INTEGER PRIMARY KEY AUTOINCREMENT` (SQLite rowid alias) | sad.md §8 |
| Column naming | `snake_case` | sad.md §2 |
| Timestamp encoding | `INTEGER` — Unix epoch milliseconds (Node.js `Date.now()`) | Derived from Node.js stack (ADR-0001) |
| CHECK on `state` | Included — finite state machine, DB-level guard is a safety invariant | Greenfield convention set here |
| Singleton guard on `owner_settings` | `CHECK (id = 1)` — ensures one row | Derived from §5 "Owner settings" as singleton |

## Convention deviations

None. This is a greenfield repo; the conventions above are being established by this data-model stage.

**FK enforcement note:** SQLite does not enforce FK constraints by default. The custom runner must execute `PRAGMA foreign_keys = ON` at connection open time. This is not in the migration SQL (it's a connection-level pragma) — must be wired in `SqliteReminderRepository` (infra layer).

## Self-check results

| Check | Result | Notes |
|---|---|---|
| Naming matches repo convention (snake_case) | ✅ PASS | All tables and columns snake_case |
| Down reversibility | ✅ PASS | Every `CREATE TABLE` → `DROP TABLE IF EXISTS`; every `CREATE INDEX` → `DROP INDEX IF EXISTS` in reverse order |
| FK indexes | ✅ PASS | `snapshot_id` has `idx_reminders_snapshot_id` |
| Convention adherence | ✅ PASS | No silent deviations; CHECK on state flagged as a deliberate new convention |

## Drift detection

Greenfield — no existing domain layer structs or schema to diff. Drift detection not applicable.

## `<!-- TBD -->` items

None — all columns are determined from spec §5 AC + sad.md §5/§6/§8.

## Open items for downstream stages

- `implement` must wire `PRAGMA foreign_keys = ON` in the SQLite connection setup (`SqliteReminderRepository`).
- `implement` must create the `_migrations` tracking table at boot (`IF NOT EXISTS`) before applying ordinal files.
- Test fixture factories (`buildOwnerSettings`, `buildSourceSnapshot`, `buildReminder`) to be written under `test/helpers/factories.ts` — not in `migrations/`.

## Next stage

`/sdd:api telegram-reminder`
