---
id: T2
title: "Add findActivePendingOrdered() to the ReminderRepository port"
layer: "app"
deps: []
acs: ["AC-01"]
files_hint: ["src/app/ports/reminder-repository.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T2 — findActivePendingOrdered() on the repository port

## Why

The list use-case reads the `pending` set through the port, not the DB directly (hexagonal). Derives from [sad §5 building blocks](../sad.md) and [spec §AC-01](../spec.md).

## What

Add `findActivePendingOrdered()` to the `ReminderRepository` interface in `src/app/ports/reminder-repository.ts` — returns Active (`pending`) reminders ordered by fire time ascending. Interface-only change; `save` is reused for the cancel write (no new write method).

## Definition of Done

- [ ] Port declares `findActivePendingOrdered()` with the ordered-read contract.
- [ ] Project compiles; existing implementers/callers unaffected.
- [ ] lint + vet clean.

## Notes

Root task — parallel with T1. Implementation lands in T3; consumers in T4/T5.
