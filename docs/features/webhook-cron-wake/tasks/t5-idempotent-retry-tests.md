---
id: T5
title: "Add idempotent-retry tests for FireDueReminders"
layer: "tests"
deps: ["T4"]
acs: ["AC-06"]
files_hint: ["src/app/use-cases/__tests__/fire-due-reminders.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T5 — Add idempotent-retry tests for FireDueReminders

## Why

[AC-06](../spec.md) requires that a retried wake cycle never re-delivers an already-fired reminder occurrence. [data-model.md](../data-model.md) notes this is already covered by the existing `reminders.delivered_at`/state-machine columns (ADR-0005) plus the [T4](./t4-scheduler-public-tick-drain.md) graceful-shutdown drain — this task adds the test coverage that proves it, per [sad.md §6 Critical flow 4](../sad.md).

## What

Extend `src/app/use-cases/__tests__/fire-due-reminders.test.ts`:
- Call `FireDueReminders.execute()` (via `Scheduler.tick()`, now public per T4) twice against the same due reminder, simulating a retried wake call — assert exactly one send and one `fired`-state write occur
- Simulate a send failure: assert the reminder is left in `firing` state (not re-attempted automatically to a false success) and is not marked `fired`, matching the "dead-letter" note in sad.md §6 Critical flow 4
- Confirm a Snoozed reminder (new scheduled occurrence) is treated as a new occurrence and does fire again

## Definition of Done

- [ ] Double-tick test passes: one send, one fired-write per occurrence
- [ ] Failed-send test passes: reminder remains in `firing`, no duplicate delivery
- [ ] Snooze-as-new-occurrence test passes
- [ ] lint + vet clean

## Notes

No production code change is expected for AC-06 itself per data-model.md's audit — if a test here reveals a real gap (e.g., the `toFire` list in `fire-due-reminders.ts` double-processing an id across `due`+`stuck`), fix it as part of this task and note it here.
