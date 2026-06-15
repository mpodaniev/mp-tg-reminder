---
id: T4
title: "ListActiveReminders use-case — build the view model with truncation + overflow"
layer: "app"
deps: ["T2"]
acs: ["AC-01", "AC-02", "AC-08"]
files_hint: ["src/app/use-cases/list-active-reminders.ts"]
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T4 — ListActiveReminders use-case

## Why

Turns the ordered `pending` set into the bounded view model the handler renders. Derives from [spec §AC-01/AC-02/AC-08](../spec.md), [sad §6 flow 1 + flow 3](../sad.md), [ADR-0003](../adr/0003-single-message-overflow-truncation.md).

## What

New `src/app/use-cases/list-active-reminders.ts`: call the port (T2), build a view model of rows (each a bounded ~100-char first-line preview + fire time). Empty set → an explicit empty view model (AC-02). When the set exceeds one message's capacity (`min(max-count, 4096 chars)`), keep the soonest-firing rows that fit and carry the count not shown for an overflow indicator (AC-08, ADR-0003). Pure app logic — rendering/tz formatting is the handler's job (T6).

## Definition of Done

- [ ] Unit test: empty set → empty view model.
- [ ] Unit test: normal set → ordered rows with bounded previews.
- [ ] Unit test: overflow → soonest-fitting rows + correct not-shown count.
- [ ] lint + vet clean.

## Notes

Truncation policy lives here (decision data), not in the handler. Parallel with T3 once T2 lands.
