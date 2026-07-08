---
id: T2
title: "List use-case: per-row status flag + capture-order truncation"
layer: "app"
deps: ["T1"]
acs: ["AC-01", "AC-02", "AC-03", "AC-08"]
files_hint: ["src/app/use-cases/list-active-reminders.ts", "src/app/use-cases/__tests__/list-active-reminders.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T2 — List use-case: per-row status flag + capture-order truncation

## Why

Derives from [spec §AC-02/AC-03/AC-08](../spec.md), [sad §5 point 1 / §6 flow 1, 4, 5](../sad.md), [ADR-0002](../adr/0002-capture-order-list-position.md). The view model must expose a scheduled/fired flag per row and truncate by earliest-added rather than soonest-firing.

## What

- `src/app/use-cases/list-active-reminders.ts` — build the view model over the widened repository result (T1): add a `scheduled` / `fired` status field per row; truncate to the message budget keeping the earliest-added (lowest `id`) rows, appending an overflow indicator for the rest.
- Position key is `id` — never `state` or `fire_at` — so it is unaffected by fire/deliver/snooze transitions (AC-03).

## Definition of Done

- [ ] unit test: each row is marked `scheduled` or `fired` from a mixed input set
- [ ] unit test: truncation keeps earliest-added rows within budget and counts overflow correctly
- [ ] lint + vet clean

## Notes

Shares `list-active-reminders.ts` with no other task — safe to serialize independently. AC-03/AC-04's cross-transition invariant gets its own dedicated integration test in T7; this task only needs the pure ordering/truncation unit tests.
