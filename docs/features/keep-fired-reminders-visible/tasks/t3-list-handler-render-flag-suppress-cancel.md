---
id: T3
title: "List handler: render scheduled/fired flag, suppress Cancel on fired rows"
layer: "ports"
deps: ["T2"]
acs: ["AC-02", "AC-05", "AC-07"]
files_hint: ["src/ports/handlers/list-handler.ts", "src/ports/__tests__/list-handler.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T3 — List handler: render scheduled/fired flag, suppress Cancel on fired rows

## Why

Derives from [spec §AC-02/AC-05](../spec.md), [sad §6 flow 6](../sad.md). Each rendered row must visibly distinguish scheduled from fired, and a fired row must never offer Cancel (only a scheduled reminder has something left to cancel).

## What

- `src/ports/handlers/list-handler.ts` — render the status flag from T2's view model per row; for rows with status `fired`, omit the Cancel button (Snooze + Delete only); scheduled rows keep Snooze + Cancel + Delete, unchanged.
- The owner-gate check upstream of this handler is unchanged — AC-07 continues to hold because a non-Owner is rejected before this rendering code runs (sad §6 flow 3).

## Definition of Done

- [ ] unit test: rendered action set for a fired row excludes Cancel
- [ ] unit test: rendered action set for a scheduled row still includes Cancel
- [ ] lint + vet clean

## Notes

AC-07's dedicated non-Owner test lives in T9 (extends the existing gate test), not here — this task only renders correctly once a request already passed the gate.
