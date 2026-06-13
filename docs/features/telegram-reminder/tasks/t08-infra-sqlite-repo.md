---
id: T08
title: "SqliteReminderRepository + test factories"
layer: "infra"
deps: ["T02", "T04"]
acs: []
files_hint:
  - src/infra/db/sqlite-reminder-repository.ts
  - src/infra/db/row-mappers.ts
  - src/infra/db/index.ts
  - test/helpers/factories.ts
  - src/infra/__tests__/sqlite-reminder-repository.test.ts
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T08 — SqliteReminderRepository + test factories

## Why

The `SqliteReminderRepository` is the concrete implementation of the `ReminderRepository` port (T04), backed by [ADR-0002](../adr/0002-sqlite-embedded-store.md) (better-sqlite3, WAL mode). It must satisfy all queries declared in `data-model.md §Indexes`.

## What

**`SqliteReminderRepository`** implements `ReminderRepository`:
- `save(reminder, snapshot)` — inserts `source_snapshots` and `reminders` in a single `db.transaction()`; atomicity guard for the Reminder aggregate (data-model.md §Aggregate Roots).
- `findById(id)` — SELECT by PK on `reminders`.
- `findWithSnapshot(id)` — JOIN `reminders` + `source_snapshots`.
- `update(reminder)` — UPDATE `reminders` by id (state, scheduled_at, fired_at, delivered_at, fired_message_id).
- `findDuePending(now)` — uses `idx_reminders_state_scheduled_at`; also re-collects `state='firing'` rows (at-least-once, T06).
- `findAwaitingExpired(cutoff)` — `state='awaiting_time' AND created_at < cutoff`.

**`row-mappers.ts`** — bidirectional conversion between `ReminderRow`/`SourceSnapshotRow` (SQLite integer/text) and domain `Reminder`/`SourceSnapshot` objects. Handles `INTEGER` → `boolean` for `is_media_protected`.

**`test/helpers/factories.ts`** — factory functions from `data-model.md §Seeds`:
```ts
buildOwnerSettings(overrides?: Partial<OwnerSettingsRow>): OwnerSettingsRow
buildSourceSnapshot(overrides?: Partial<SourceSnapshotRow>): SourceSnapshotRow
buildReminder(state: ReminderState, overrides?: Partial<ReminderRow>): ReminderRow
```
PII guard: `owner_telegram_id: 123456789` in all defaults.

## Definition of Done

- [ ] Integration test (real in-memory SQLite): `save` + `findWithSnapshot` round-trip returns identical domain objects
- [ ] `findDuePending` returns `pending` rows with `scheduled_at <= now` and `firing` rows (at-least-once re-collect)
- [ ] `save` is atomic: partial insert (snapshot succeeds, reminder fails) leaves no orphaned snapshot row
- [ ] `update` correctly maps all nullable fields (NULL for cleared `fired_at`/`delivered_at`)
- [ ] Factory `buildReminder('fired')` produces a valid `ReminderRow` passable to `save`
- [ ] lint + vet clean

## Notes

Derives from [data-model.md](../data-model.md) and [ADR-0002](../adr/0002-sqlite-embedded-store.md). `PRAGMA foreign_keys = ON` is set by the migration runner (T02) — do not repeat in the repo. WAL mode should be set by the runner or a DB-open helper, not per-query.
