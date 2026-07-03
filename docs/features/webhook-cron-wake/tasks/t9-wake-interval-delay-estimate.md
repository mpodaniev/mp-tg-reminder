---
id: T9
title: "Add a wake-interval-aware delay estimate to reminder confirmation (AC-03)"
layer: "app"
deps: []
acs: ["AC-03"]
files_hint: ["src/app/use-cases/schedule-reminder.ts", "src/ports/router.ts", "src/app/use-cases/__tests__/schedule-reminder.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T9 — Add a wake-interval-aware delay estimate to reminder confirmation (AC-03)

## Why

[AC-03](../spec.md) requires the Owner be told, at confirmation time, that a reminder scheduled sooner than the wake interval may arrive up to one wake interval late — per [sad.md §6 Critical flow 1b](../sad.md) and the 3-minute wake interval fixed in sad.md §7.

## What

`ScheduleReminder.execute()` (or the router's confirmation-reply code in `handleQuickPick`/`handleCustomTimeInput`) compares `scheduledAtMs - Date.now()` against the configured wake interval (a constant/env value, matching the same number T13/T15 wire into deployment) and returns/flags whether the chosen time falls sooner than that interval. The router's reply message appends the AC-03 delay note only in that case.

## Definition of Done

- [ ] A test confirms a reminder scheduled sooner than the wake interval produces the "may arrive up to the wake interval late" note in the confirmation reply
- [ ] A test confirms a reminder scheduled with headroom over the wake interval produces no such note
- [ ] The wake interval value is a single named constant, not duplicated across files
- [ ] lint + vet clean

## Notes

No persistence or HTTP dependency — this task is independent of the migration/infra/HTTP-adapter branches and can run in parallel with T1–T8, T10.
