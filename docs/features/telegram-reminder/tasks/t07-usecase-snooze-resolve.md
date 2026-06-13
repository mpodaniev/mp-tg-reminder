---
id: T07
title: "Use cases: SnoozeReminder + ResolveReminder"
layer: "app"
deps: ["T04"]
acs: ["AC-05", "AC-06", "AC-07", "AC-10"]
files_hint:
  - src/app/use-cases/snooze-reminder.ts
  - src/app/use-cases/resolve-reminder.ts
  - src/app/use-cases/__tests__/snooze-reminder.test.ts
  - src/app/use-cases/__tests__/resolve-reminder.test.ts
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T07 — Use cases: SnoozeReminder + ResolveReminder

## Why

These use cases handle Owner actions on a fired reminder (callback buttons Snooze / Done / Delete). They enforce the lifecycle invariant that resolved reminders cannot be snoozed (AC-10) and transition the state machine accordingly.

## What

**`SnoozeReminder`** — input: `{ reminderId, newScheduledAt: ScheduledTime }`:
1. `repo.findById(reminderId)`.
2. If `state` is `done|deleted` → throw `AlreadyResolvedError` (AC-10).
3. `transition(reminder, { type: 'snooze', newScheduledAt })` → `pending` with updated `scheduledAt`, cleared `firedAt`/`deliveredAt`/`firedMessageId`.
4. `repo.update(reminder)`.
5. Return new `scheduledAt`.

**`ResolveReminder`** — input: `{ reminderId, resolution: 'done' | 'deleted' }`:
1. `repo.findById(reminderId)`.
2. `transition(reminder, { type: resolution })` → `done` or `deleted`.
3. `repo.update(reminder)`.
4. Return `firedMessageId` (caller — T11 callback handler — deletes/edits the Telegram message).

Both use cases: zero Telegram calls — all message operations are delegated to the callback handler layer (T11) after the use case returns.

## Definition of Done

- [ ] `SnoozeReminder` unit test: happy path transitions `fired → pending` with new `scheduledAt` (AC-05)
- [ ] `SnoozeReminder` throws `AlreadyResolvedError` when state is `done` or `deleted` (AC-10)
- [ ] `ResolveReminder` unit test: `done` transitions `fired → done`; `deleted` transitions `fired → deleted` (AC-06, AC-07)
- [ ] Both use cases do not call any gateway method (pure repo interaction)
- [ ] lint + vet clean

## Notes

Derives from [spec §5 AC-05, AC-06, AC-07, AC-10](../spec.md) and [sad §6 Flows 6, 7](../sad.md). Can start in parallel with T05 and T06 once T04 is done.
