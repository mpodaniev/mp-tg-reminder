---
id: T03
title: "Reminder entity + state machine + value objects + domain errors"
layer: "domain"
deps: ["T01"]
acs: ["AC-02", "AC-03", "AC-05", "AC-08", "AC-10"]
files_hint:
  - src/domain/reminder.ts
  - src/domain/state-machine.ts
  - src/domain/value-objects/scheduled-time.ts
  - src/domain/value-objects/source-snapshot.ts
  - src/domain/errors.ts
  - src/domain/index.ts
  - src/domain/__tests__/
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T03 — Reminder entity + state machine + value objects + domain errors

## Why

The domain layer is the core of the ports-and-adapters architecture ([ADR-0006](../adr/0006-ports-and-adapters-layering.md)). All use cases (T05–T07) operate on these types — no infra or framework dependency can enter here.

## What

**`Reminder` entity** — mirrors `data-model.md §reminders`:
- Fields: `id`, `snapshotId`, `state: ReminderState`, `scheduledAt`, `firedAt`, `deliveredAt`, `firedMessageId`, `createdAt`.
- `ReminderState` union: `awaiting_time | pending | firing | fired | done | deleted | expired`.

**State machine** (`src/domain/state-machine.ts`) — pure functions, no side effects:
- `transition(reminder, event)` — enforces valid arcs: `awaiting_time→pending`, `pending→firing`, `firing→fired`, `fired→done`, `fired→deleted`, `fired→pending` (snooze), `awaiting_time→expired`.
- Throws `InvalidTransitionError` for illegal arcs.
- Guards: `snooze` blocked when `state` is `done|deleted` (AC-10).

**Value object `ScheduledTime`** (`src/domain/value-objects/scheduled-time.ts`):
- Wraps a UTC epoch-ms integer.
- Constructor throws `PastTimeError` if `value <= Date.now()` (AC-08).
- Static `fromQuickPick(pick, timezone)` — resolves quick-pick strings (`in_1h`, `this_evening`, `tomorrow_morning`, `in_1week`) into a future `ScheduledTime` given an IANA timezone; hides picks already in the past today (AC-05).
- Static `parse(input, timezone)` — accepts relative phrases ("за 2 год", "завтра 15:00") and structured `DD.MM.YYYY HH:MM`; throws `PastTimeError` for past input (spec §8 OQ-1 resolution).

**Value object `SourceSnapshot`** (`src/domain/value-objects/source-snapshot.ts`):
- Mirrors `data-model.md §source_snapshots` fields as an immutable record.
- `hasDeepLink()` → `boolean` — `true` iff `chatUsername` and `messageId` are both present (AC-11 gate).
- `isMediaProtected` flag (AC-12 gate).

**Sentinel errors** (`src/domain/errors.ts`): `InvalidTransitionError`, `PastTimeError`, `AlreadyResolvedError`, `TimezoneNotConfiguredError`.

## Definition of Done

- [ ] Unit tests for all 8 state-machine arc combinations (valid + invalid) pass
- [ ] `ScheduledTime` constructor rejects past timestamps (AC-08 unit test)
- [ ] `ScheduledTime.fromQuickPick` hides past-today quick-picks (AC-05 unit test)
- [ ] `SourceSnapshot.hasDeepLink()` returns correct boolean in both AC-11 branches
- [ ] `transition` throws `AlreadyResolvedError` for snooze-on-resolved (AC-10 unit test)
- [ ] Zero imports from `infra/`, `ports/`, `app/` (domain must be pure)
- [ ] lint + vet clean

## Notes

Derives from [spec §5 AC-02, AC-03, AC-05, AC-08, AC-10](../spec.md), [sad §5](../sad.md), [data-model.md](../data-model.md). `ScheduledTime.parse` implements the spec §8 OQ-1 resolution (natural-language + structured; date-only → 09:00; time-only → next future occurrence). Can start in parallel with T02.
