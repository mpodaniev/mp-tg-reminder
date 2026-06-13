---
id: T05
title: "Use cases: CaptureMessage + ScheduleReminder"
layer: "app"
deps: ["T04"]
acs: ["AC-01", "AC-02", "AC-03", "AC-08", "AC-09", "AC-13"]
files_hint:
  - src/app/use-cases/capture-message.ts
  - src/app/use-cases/schedule-reminder.ts
  - src/app/use-cases/__tests__/capture-message.test.ts
  - src/app/use-cases/__tests__/schedule-reminder.test.ts
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T05 — Use cases: CaptureMessage + ScheduleReminder

## Why

These two use cases implement the capture-and-scheduling happy path (Flows 1–4 in [sad §6](../sad.md)) and are the entry points for the grammY router (T10).

## What

**`CaptureMessage`** — input: `{ update, ownerSettings }`:
1. **AuthZ gate:** if `update.from.id !== ownerSettings.ownerTelegramId` → throw `UnauthorizedError` (AC-09, handled silently by the router — no reply).
2. **Timezone gate:** if `ownerSettings.timezone === null` → throw `TimezoneNotConfiguredError` (AC-13 — router asks Owner to run `/settings` first).
3. Build `SourceSnapshot` from the forwarded message's forward-header fields (chat_id, message_id, chat_username, sender_name, sender_username, text, media_file_id, media_type, is_media_protected).
4. Create `Reminder` in `awaiting_time` state.
5. Call `repo.save(reminder, snapshot)` — atomic single transaction (data-model.md §Aggregate).
6. Return the new `reminderId`.

**`ScheduleReminder`** — input: `{ reminderId, scheduledAt: ScheduledTime }`:
1. Load reminder via `repo.findById`.
2. Throw `ReminderNotFoundError` if absent.
3. `transition(reminder, { type: 'schedule', scheduledAt })` → `pending`.
4. `repo.update(reminder)`.
5. Return confirmed `scheduledAt`.

Both use cases depend only on `ReminderRepository` (injected) and domain types — zero Telegram calls.

## Definition of Done

- [ ] `CaptureMessage` unit test with fake repo: happy path creates `awaiting_time` reminder with correct snapshot fields
- [ ] `CaptureMessage` rejects non-Owner ID with `UnauthorizedError` (AC-09)
- [ ] `CaptureMessage` throws `TimezoneNotConfiguredError` when timezone is null (AC-13)
- [ ] `ScheduleReminder` unit test: transitions reminder to `pending` with correct `scheduled_at`
- [ ] `ScheduleReminder` re-throws `PastTimeError` from `ScheduledTime` when past input given (AC-08)
- [ ] lint + vet clean

## Notes

Derives from [spec §5 AC-01..03, AC-08, AC-09, AC-13](../spec.md) and [sad §6 Flows 1, 3, 4](../sad.md). Can start in parallel with T06 and T07 once T04 is done.
